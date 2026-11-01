#!/usr/bin/env bash
# Installs this MarkText fork on Ubuntu/Debian (x64) from GitHub Releases.
#
#   ./install.sh                          latest release
#   ./install.sh v0.24.0-sj.8             a specific release tag
#   ./install.sh --download-only [tag]    only fetch the .deb into the current directory
#
# The .deb is checked against the SHA256SUMS.txt published with the release
# before anything is installed. `apt` is run with --allow-downgrades because
# Debian sorts the fork's `0.24.0~sj.N` below upstream's `0.24.0~dev`.
set -euo pipefail

REPO='SimonasJurksa/marktext'
API="https://api.github.com/repos/${REPO}"

download_only=0
tag=''
for arg in "$@"; do
  case "$arg" in
    --download-only) download_only=1 ;;
    -h | --help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
    *) tag="$arg" ;;
  esac
done

die() {
  echo "install.sh: $*" >&2
  exit 1
}

command -v curl > /dev/null || die 'curl is required (sudo apt install curl)'
command -v dpkg > /dev/null || die 'this script is for Debian-based systems (dpkg not found)'

arch="$(dpkg --print-architecture)"
[ "$arch" = 'amd64' ] || die "only amd64 builds are published; this machine is ${arch}"

if [ -z "$tag" ]; then
  tag="$(curl -fsSL "${API}/releases/latest" | sed -n 's/^ *"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)"
  [ -n "$tag" ] || die 'could not resolve the latest release tag from the GitHub API'
fi
case "$tag" in
  v*) ;;
  *) tag="v${tag}" ;;
esac

version="${tag#v}"
asset="marktext-linux-${version}.deb"
base="https://github.com/${REPO}/releases/download/${tag}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

echo "Downloading ${asset} from release ${tag} ..."
if ! curl -fL --progress-bar -o "${workdir}/${asset}" "${base}/${asset}"; then
  die "download failed: ${base}/${asset}
If the tag was pushed a few minutes ago the release may still be building:
https://github.com/${REPO}/actions"
fi

# SHA256SUMS.txt lists every asset of the release; verify only the .deb.
if curl -fsSL -o "${workdir}/SHA256SUMS.txt" "${base}/SHA256SUMS.txt"; then
  expected="$(grep -E "[[:space:]]\*?${asset}\$" "${workdir}/SHA256SUMS.txt" | awk '{ print $1 }' | head -n 1)"
  if [ -n "$expected" ]; then
    actual="$(sha256sum "${workdir}/${asset}" | awk '{ print $1 }')"
    [ "$actual" = "$expected" ] || die "checksum mismatch for ${asset}: expected ${expected}, got ${actual}"
    echo 'Checksum OK.'
  else
    echo "Warning: ${asset} is not listed in SHA256SUMS.txt, skipping verification." >&2
  fi
else
  echo 'Warning: SHA256SUMS.txt not published for this release, skipping verification.' >&2
fi

if [ "$download_only" = 1 ]; then
  mv "${workdir}/${asset}" "./${asset}"
  echo "Saved ./${asset}"
  echo "Install it with: sudo apt install --allow-downgrades ./${asset}"
  exit 0
fi

installed="$(dpkg-query -W -f='${Version}' marktext 2> /dev/null || true)"
if [ -n "$installed" ]; then
  echo "Replacing installed marktext ${installed} with ${version} ..."
fi

sudo apt install -y --allow-downgrades "${workdir}/${asset}"
echo "Installed marktext $(dpkg-query -W -f='${Version}' marktext)"
