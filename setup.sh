#!/bin/bash
# ─── Arb Bot Setup Script ────────────────────────────────────────────────────
# Installs dependencies, builds, and pushes to a new GitHub repo.
# Usage: bash setup.sh <your-github-username>
# ─────────────────────────────────────────────────────────────────────────────

set -e

REPO_NAME="arb-bot"
GITHUB_USER="${1:-}"

echo ""
echo "  ⇄  ARB BOT — Setup Script"
echo "  ──────────────────────────"

# ── 1. npm install ────────────────────────────────────────────────────────────
echo ""
echo "  [1/5] Installing dependencies..."
npm install
echo "  ✓ Dependencies installed"

# ── 2. Build ──────────────────────────────────────────────────────────────────
echo ""
echo "  [2/5] Building app..."
npm run build
echo "  ✓ Build succeeded → dist/"

# ── 3. Git init ───────────────────────────────────────────────────────────────
echo ""
echo "  [3/5] Initialising git repo..."
git init
git add .
git commit -m "Initial commit: Arb Bot v2 — Polymarket scanner + Kelly sizer"
git branch -M main
echo "  ✓ Git repo initialised"

# ── 4. Create GitHub repo ────────────────────────────────────────────────────
echo ""
echo "  [4/5] Creating GitHub repository..."

if command -v gh &>/dev/null; then
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
  REPO_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}"
  echo "  ✓ Repo created and pushed via gh CLI"
else
  if [ -z "$GITHUB_USER" ]; then
    echo ""
    echo "  ⚠  gh CLI not found. Run this script with your GitHub username:"
    echo "     bash setup.sh <your-github-username>"
    echo ""
    echo "  Then create the repo at https://github.com/new (name it '${REPO_NAME}')"
    echo "  and run:"
    echo "     git remote add origin https://github.com/<you>/${REPO_NAME}.git"
    echo "     git push -u origin main"
    exit 0
  fi

  REPO_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}"
  git remote add origin "${REPO_URL}.git"

  echo ""
  echo "  ⚠  gh CLI not found. Please:"
  echo "     1. Go to https://github.com/new"
  echo "     2. Create a repo named '${REPO_NAME}' (public, no README)"
  echo "     3. Then run:  git push -u origin main"
fi

# ── 5. Enable GitHub Pages ────────────────────────────────────────────────────
echo ""
echo "  [5/5] GitHub Pages"
if command -v gh &>/dev/null; then
  gh api "repos/${GITHUB_USER}/${REPO_NAME}/pages" \
    --method POST \
    --field source='{"branch":"gh-pages","path":"/"}' 2>/dev/null || true
  echo "  ✓ On your first push, GitHub Actions will build & deploy automatically."
  echo "     Your app will be live at: https://${GITHUB_USER}.github.io/${REPO_NAME}/"
else
  echo "  After pushing, go to:"
  echo "     https://github.com/${GITHUB_USER}/${REPO_NAME}/settings/pages"
  echo "  Set Source → GitHub Actions. The workflow will deploy on every push."
  echo "  Live URL: https://${GITHUB_USER}.github.io/${REPO_NAME}/"
fi

echo ""
echo "  ──────────────────────────"
echo "  ✓ All done! Happy arbing."
echo ""
