#!/usr/bin/env bash
# Auto-generate a changeset if packages changed but no changeset exists.
# Used as a safety net in the release workflow for direct pushes to main.
set -euo pipefail

# If pending changesets already exist, nothing to do
PENDING=$(ls .changeset/*.md 2>/dev/null | grep -v README.md || true)
if [ -n "$PENDING" ]; then
  echo "Changesets already exist, skipping auto-generation."
  exit 0
fi

# Get the last release commit (the most recent "chore: version packages" commit)
LAST_RELEASE=$(git log --oneline --all --grep="chore: version packages" -1 --format="%H" || true)
if [ -z "$LAST_RELEASE" ]; then
  # Fallback: compare against previous commit
  LAST_RELEASE="HEAD~1"
fi

echo "Comparing against: $LAST_RELEASE"

# Map of directories to package names
declare -A PKG_MAP=(
  ["packages/sdk/src"]="@smartagentkit/sdk"
  ["packages/cli/src"]="@smartagentkit/cli"
  ["packages/integrations/langchain/src"]="@smartagentkit/langchain"
  ["packages/testing/src"]="@smartagentkit/testing"
)

# Detect which packages have source changes
CHANGED_PKGS=()
for dir in "${!PKG_MAP[@]}"; do
  if git diff --name-only "$LAST_RELEASE"..HEAD -- "$dir" | grep -q .; then
    CHANGED_PKGS+=("${PKG_MAP[$dir]}")
  fi
done

if [ ${#CHANGED_PKGS[@]} -eq 0 ]; then
  echo "No publishable package source changes detected, skipping."
  exit 0
fi

echo "Changed packages: ${CHANGED_PKGS[*]}"

# Build the changeset frontmatter
FRONTMATTER=""
for pkg in "${CHANGED_PKGS[@]}"; do
  FRONTMATTER+="\"$pkg\": patch"$'\n'
done

# Get a summary from the commit messages since last release
SUMMARY=$(git log --oneline "$LAST_RELEASE"..HEAD --no-merges --format="%s" | head -5 | paste -sd ", " -)

# Generate changeset file
FILENAME=".changeset/auto-$(date +%s).md"
cat > "$FILENAME" <<CHANGESET
---
${FRONTMATTER}---

${SUMMARY}
CHANGESET

echo "Auto-generated changeset: $FILENAME"
cat "$FILENAME"
