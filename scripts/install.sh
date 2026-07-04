#!/usr/bin/env bash
# Install outrider from the latest (or a given) GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/andrealeone/outrider/master/scripts/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/andrealeone/outrider/master/scripts/install.sh | bash -s v0.1.0

set -euo pipefail

case "$(uname -ms)" in
'Darwin arm64') target=darwin-arm64 ;;
'Darwin x86_64') target=darwin-x64 ;;
'Linux aarch64' | 'Linux arm64') target=linux-arm64 ;;
'Linux x86_64') target=linux-x64 ;;
*)
  echo "error: unsupported platform \"$(uname -ms)\"; build from source instead: https://github.com/andrealeone/outrider#readme" >&2
  exit 1
  ;;
esac

repo="${GITHUB:-https://github.com}/andrealeone/outrider"
if [[ $# = 0 ]]; then
  uri="$repo/releases/latest/download/outrider-$target"
else
  uri="$repo/releases/download/$1/outrider-$target"
fi

bin_dir="${OUTRIDER_INSTALL:-$HOME/.local}/bin"
exe="$bin_dir/outrider"

mkdir -p "$bin_dir"
curl --fail --location --progress-bar --output "$exe" "$uri"
chmod +x "$exe"

echo "outrider installed to $exe"

case ":$PATH:" in
*":$bin_dir:"*)
  echo "run 'outrider on' to start the daemon, then 'outrider' to open the dashboard"
  ;;
*)
  echo "add $bin_dir to your PATH, then run 'outrider on' and 'outrider'"
  ;;
esac
