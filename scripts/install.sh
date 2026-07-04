#!/usr/bin/env bash
#
# Install outrider from the latest (or a given) GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/andrealeone/outrider/master/scripts/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/andrealeone/outrider/master/scripts/install.sh | bash -s v0.1.0

# Exit immediately on any error (-e), treat unset variables as errors (-u),
# and make a failure anywhere in a pipeline fail the whole pipeline (-o
# pipefail). This keeps a partial/broken install from silently continuing.
set -euo pipefail

# ANSI color codes for user-facing messages. They're only enabled when
# stdout is a terminal that a human is actually looking at; when the
# output is redirected to a file or pipe, escape codes are left blank so
# logs stay clean and readable.
if [ -t 1 ]; then
  bold=$'\033[1m'
  dim=$'\033[2m'
  red=$'\033[31m'
  green=$'\033[32m'
  yellow=$'\033[33m'
  blue=$'\033[34m'
  reset=$'\033[0m'
else
  bold='' dim='' red='' green='' yellow='' blue='' reset=''
fi

echo

# Detect the OS and CPU architecture (e.g. "Darwin arm64") and map it to the
# name used for the prebuilt release binaries. Any combination that isn't
# explicitly supported falls into the `*` case, which prints a helpful error
# and points the user to building from source instead of guessing a binary.
case "$(uname -ms)" in
'Darwin arm64') target=darwin-arm64 ;;
'Darwin x86_64') target=darwin-x64 ;;
'Linux aarch64' | 'Linux arm64') target=linux-arm64 ;;
'Linux x86_64') target=linux-x64 ;;
*)
  echo "${red}error:${reset} unsupported platform \"$(uname -ms)\"; build from source instead: https://github.com/andrealeone/outrider#readme" >&2
  exit 1
  ;;
esac

# The GitHub repository to fetch the release from. This can be overridden
# with the GITHUB env var (e.g. to point at a GitHub Enterprise mirror).
repo="${GITHUB:-https://github.com}/andrealeone/outrider"

# Build the download URL for the binary. With no arguments, install the
# latest release; if a version is passed as the first script argument
# (e.g. "v0.1.0"), install that specific release instead.
if [[ $# = 0 ]]; then
  uri="$repo/releases/latest/download/outrider-$target"
else
  uri="$repo/releases/download/$1/outrider-$target"
fi

# Ask the user to confirm before downloading anything, showing exactly
# which platform binary is about to be fetched and from where. Because this
# script is typically run as `curl ... | bash`, stdin is the script itself
# rather than the keyboard, so the prompt is read from /dev/tty. If no
# terminal is available to prompt on (e.g. fully non-interactive/CI use),
# the confirmation is skipped and the install proceeds.
if [ -r /dev/tty ]; then
  echo "Source: $uri"
  read -r -p "${yellow}Download outrider for ${bold}$target${reset}${yellow}? [y/N] ${reset}" reply < /dev/tty
  case "$reply" in
  [yY] | [yY][eE][sS]) ;;
  *)
    echo "${red}aborted:${reset} no changes were made" >&2
    exit 1
    ;;
  esac
else
  echo "${dim}no interactive terminal detected; proceeding to download outrider for $target${reset}" >&2
fi

# Where the binary will live: $OUTRIDER_INSTALL/bin if set, otherwise
# ~/.local/bin, following the common convention for user-local installs
# that don't require root privileges.
bin_dir="${OUTRIDER_INSTALL:-$HOME/.local}/bin"
exe="$bin_dir/outrider"

# Ensure the destination directory exists before writing the binary into it.
mkdir -p "$bin_dir"

# Download the binary: fail on HTTP errors, follow redirects (GitHub release
# assets are served via redirects), show a progress bar, and write directly
# to the final destination path.
curl --fail --location --progress-bar --output "$exe" "$uri"

# Make the downloaded binary executable.
chmod +x "$exe"

echo "${green}outrider installed to $exe${reset}"
echo

# Check whether bin_dir is already on the user's PATH so we can tell them
# whether they can run `outrider` right away or need to update their PATH
# first.
case ":$PATH:" in
*":$bin_dir:"*)
  echo "Run ${bold}'outrider on'${reset} to start the daemon, then ${bold}'outrider'${reset} to open the dashboard"
  ;;
*)
  echo "Add ${bold}$bin_dir${reset} to your PATH, then run ${bold}'outrider on'${reset} and ${bold}'outrider'${reset}"
  ;;
esac
