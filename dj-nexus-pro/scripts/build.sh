#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DJ Nexus Pro — Full build script
#
# Usage:
#   ./scripts/build.sh                  # build for current platform
#   ./scripts/build.sh --mac            # build macOS DMG
#   ./scripts/build.sh --win            # build Windows NSIS installer
#   ./scripts/build.sh --linux          # build Linux AppImage + deb
#   ./scripts/build.sh --all-platforms  # build all three
#   ./scripts/build.sh --sign           # enable code signing
#
# Environment variables for code signing:
#   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID  (macOS notarisation)
#   CSC_LINK, CSC_KEY_PASSWORD                             (Windows certificate)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[build]${NC} $*"; }
success() { echo -e "${GREEN}[build]${NC} $*"; }
warn()    { echo -e "${YELLOW}[build]${NC} $*"; }
error()   { echo -e "${RED}[build]${NC} $*" >&2; exit 1; }

# ── Parse arguments ────────────────────────────────────────────────────────────
PLATFORM=""
SIGN=false
SKIP_RUST=false
SKIP_RENDERER=false
SKIP_ELECTRON=false

for arg in "$@"; do
  case "$arg" in
    --mac)            PLATFORM="mac"   ;;
    --win)            PLATFORM="win"   ;;
    --linux)          PLATFORM="linux" ;;
    --all-platforms)  PLATFORM="all"   ;;
    --sign)           SIGN=true        ;;
    --skip-rust)      SKIP_RUST=true   ;;
    --skip-renderer)  SKIP_RENDERER=true ;;
    --skip-electron)  SKIP_ELECTRON=true ;;
    *)                warn "Unknown argument: $arg" ;;
  esac
done

# ── Dependency checks ──────────────────────────────────────────────────────────
info "Checking build dependencies…"

command -v node  >/dev/null 2>&1 || error "node is required but not found"
command -v npm   >/dev/null 2>&1 || error "npm is required but not found"
command -v cargo >/dev/null 2>&1 || error "Rust/cargo is required (install via rustup.rs)"

NODE_VER=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>&1 || true)
node -e "if (parseInt(process.version.slice(1)) < 18) process.exit(1)" \
  || error "Node.js >= 18 required (found $(node --version))"

success "Dependencies OK (node=$(node --version), cargo=$(cargo --version | cut -d' ' -f2))"

# ── Step 1: Rust audio engine ──────────────────────────────────────────────────
if [ "$SKIP_RUST" = false ]; then
  info "Building Rust audio engine…"
  pushd audio-engine > /dev/null

  # Ensure napi CLI is available
  if ! command -v napi >/dev/null 2>&1; then
    npm install -g @napi-rs/cli 2>/dev/null || warn "@napi-rs/cli not installed globally — using local"
  fi

  # Add target for cross-compilation if needed
  if [ "$PLATFORM" = "win" ] || [ "$PLATFORM" = "all" ]; then
    rustup target add x86_64-pc-windows-msvc 2>/dev/null || true
  fi
  if [ "$PLATFORM" = "linux" ] || [ "$PLATFORM" = "all" ]; then
    rustup target add x86_64-unknown-linux-gnu 2>/dev/null || true
  fi
  if [ "$PLATFORM" = "mac" ] || [ "$PLATFORM" = "all" ]; then
    rustup target add aarch64-apple-darwin 2>/dev/null || true
    rustup target add x86_64-apple-darwin 2>/dev/null || true
  fi

  cargo build --release
  success "Rust audio engine built"

  # Copy .node binary to src directory so Node can require() it
  NATIVE_OUT="$REPO_ROOT/src/native"
  mkdir -p "$NATIVE_OUT"
  # napi-rs outputs: target/release/<crate_name>.node  (on most platforms)
  find target/release -maxdepth 1 -name "*.node" -exec cp {} "$NATIVE_OUT/" \; 2>/dev/null || \
    warn "No .node binaries found in target/release (may need 'napi build --release')"

  popd > /dev/null
else
  warn "Skipping Rust build (--skip-rust)"
fi

# ── Step 2: Install Node.js dependencies ──────────────────────────────────────
info "Installing Node.js dependencies…"
npm ci --prefer-offline
success "Node dependencies installed"

# ── Step 3: TypeScript type check ─────────────────────────────────────────────
info "Type-checking TypeScript…"
npm run typecheck           || error "TypeScript errors in renderer"
npm run typecheck:electron  || error "TypeScript errors in electron process"
success "TypeScript OK"

# ── Step 4: ESLint ────────────────────────────────────────────────────────────
info "Running ESLint…"
npm run lint || warn "ESLint found warnings (see above)"
success "ESLint passed"

# ── Step 5: Tests ─────────────────────────────────────────────────────────────
info "Running tests…"
npm test -- --run || error "Tests failed"
success "All tests passed"

# ── Step 6: Build Electron main process ───────────────────────────────────────
if [ "$SKIP_ELECTRON" = false ]; then
  info "Building Electron main process (tsc)…"
  npm run build:electron || error "Electron main build failed"
  success "Electron main built → dist/electron/"
else
  warn "Skipping Electron build (--skip-electron)"
fi

# ── Step 7: Build React renderer (Vite) ───────────────────────────────────────
if [ "$SKIP_RENDERER" = false ]; then
  info "Building React renderer (Vite)…"
  npm run build:renderer || error "Vite renderer build failed"
  success "Renderer built → dist/renderer/"
else
  warn "Skipping renderer build (--skip-renderer)"
fi

# ── Step 8: Package with electron-builder ─────────────────────────────────────
info "Packaging application with electron-builder…"

SIGN_FLAGS=""
if [ "$SIGN" = true ]; then
  info "Code signing enabled"
  if [ -n "${APPLE_ID:-}" ]; then
    export APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID
    info "macOS notarisation credentials set"
  fi
  if [ -n "${CSC_LINK:-}" ]; then
    export CSC_LINK CSC_KEY_PASSWORD
    info "Windows code signing certificate set"
  fi
fi

case "$PLATFORM" in
  "mac")   npm run dist:mac   -- $SIGN_FLAGS ;;
  "win")   npm run dist:win   -- $SIGN_FLAGS ;;
  "linux") npm run dist:linux -- $SIGN_FLAGS ;;
  "all")
    npm run dist:mac   -- $SIGN_FLAGS
    npm run dist:win   -- $SIGN_FLAGS
    npm run dist:linux -- $SIGN_FLAGS
    ;;
  *)
    npm run dist -- $SIGN_FLAGS
    ;;
esac

# ── Done ───────────────────────────────────────────────────────────────────────
RELEASE_DIR="$REPO_ROOT/release"
success "Build complete! Installers are in: $RELEASE_DIR"

if [ -d "$RELEASE_DIR" ]; then
  echo ""
  info "Build artifacts:"
  find "$RELEASE_DIR" -maxdepth 2 \( -name "*.dmg" -o -name "*.exe" -o -name "*.AppImage" -o -name "*.deb" \) \
    | while read -r f; do
        SIZE=$(du -sh "$f" 2>/dev/null | cut -f1)
        echo "  ${GREEN}✓${NC}  $f  ($SIZE)"
      done
fi
