#!/usr/bin/env bash
# Portable Conventional Commit validator for local use and GitHub Actions.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

usage() {
  cat <<'EOF'
usage:
  ./scripts/verify-commit-message.sh --title "feat(timetable): add ..."
  ./scripts/verify-commit-message.sh --message-file .git/COMMIT_EDITMSG
  ./scripts/verify-commit-message.sh --commit <commit-ish>
  ./scripts/verify-commit-message.sh --range <base> <head> [--title "..."]

The range mode is intended for CI. Merge commits, the initial root commit,
and GitHub-generated Revert commits are reported and skipped.
EOF
}

failures=0
temporary_dir=""
cleanup() {
  if [[ -n "$temporary_dir" && -d "$temporary_dir" ]]; then
    rm -rf "$temporary_dir"
  fi
}
trap cleanup EXIT

fail() {
  echo "error: $1" >&2
  failures=$((failures + 1))
}

lint_header() {
  local context="$1"
  local header="$2"
  local header_pattern='^(feat|fix|docs|refactor|perf|test|build|ci|chore|revert)(\(([a-z0-9][a-z0-9._/-]{0,29})\))?(!)?: (.+)$'
  local failures_before="$failures"

  if [[ -z "$header" ]]; then
    fail "$context: first line is empty"
    return 1
  fi
  if [[ "$header" == *$'\r' ]]; then
    fail "$context: CRLF is not allowed; use LF line endings"
    return 1
  fi
  if ((${#header} > 72)); then
    fail "$context: header is ${#header} characters; maximum is 72"
  fi
  if [[ ! "$header" =~ $header_pattern ]]; then
    fail "$context: expected <type>(<scope>)?: <description> (optional !); allowed types: feat, fix, docs, refactor, perf, test, build, ci, chore, revert"
    return 1
  fi

  local description="${BASH_REMATCH[5]}"
  if ((${#description} > 60)); then
    fail "$context: description is ${#description} characters; maximum is 60"
  fi
  if [[ "$description" =~ ^[[:space:]] || "$description" =~ [[:space:]]$ ]]; then
    fail "$context: description must not start or end with whitespace"
  fi
  # English starts lower-case. CJK and numeric descriptions are allowed.
  local first_character="${description%"${description#?}"}"
  if [[ "$first_character" =~ ^[A-Z]$ ]]; then
    fail "$context: English description must start lower-case (got '$first_character')"
  fi
  case "$description" in
    *.|*!|*\?|*。)
      fail "$context: description must not end with punctuation (. ! ? 。)"
      ;;
  esac
  if ((failures > failures_before)); then
    return 1
  fi
  return 0
}

lint_message_file() {
  local context="$1"
  local message_file="$2"
  local require_breaking_footer="${3:-1}"
  local header
  local line
  local line_number=0
  local body_seen=0
  local footer_started=0
  local previous_blank=1
  local breaking_footer=0
  local footer_pattern='^(BREAKING[ -]CHANGE|[A-Za-z][A-Za-z-]*):[[:space:]]+[^[:space:]].*$'
  local closing_pattern='^(Closes|Fixes|Resolves)[[:space:]]+#[0-9]+([[:space:]].*)?$'
  local breaking_footer_pattern='^BREAKING[ -]CHANGE:[[:space:]]+[^[:space:]].*$'
  local failures_before="$failures"

  if [[ ! -f "$message_file" ]]; then
    fail "$context: message file does not exist: $message_file"
    return 1
  fi
  if grep -n $'\r' "$message_file" >/dev/null 2>&1; then
    fail "$context: CRLF is not allowed; use LF line endings"
  fi

  header="$(sed -n '1p' "$message_file")"
  lint_header "$context" "$header" || true

  if [[ -n "$(sed -n '2p' "$message_file")" ]]; then
    fail "$context: body or footer must be separated from the header by one blank line"
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line_number=$((line_number + 1))
    [[ "$line_number" -le 2 ]] && continue
    if [[ -z "$line" ]]; then
      previous_blank=1
      continue
    fi
    if ((${#line} > 100)); then
      fail "$context: line $line_number is ${#line} characters; body/footer lines must be wrapped at 100"
    fi

    if [[ "$line" =~ $footer_pattern || "$line" =~ $closing_pattern ]]; then
      if ((body_seen == 1 && previous_blank == 0 && footer_started == 0)); then
        fail "$context: footer must be separated from the body by a blank line"
      fi
      footer_started=1
      if [[ "$line" =~ $breaking_footer_pattern ]]; then
        breaking_footer=1
      fi
    elif ((footer_started == 1)); then
      if [[ "$line" != " "* && "$line" != $'\t'* ]]; then
        fail "$context: unindented text cannot follow a footer (line $line_number)"
      fi
    else
      body_seen=1
    fi
    previous_blank=0
  done < "$message_file"

  if [[ "$header" == *'!:'* && "$require_breaking_footer" == 1 && "$breaking_footer" == 0 ]]; then
    fail "$context: a ! breaking marker requires a BREAKING CHANGE: <impact> footer"
  fi
  if [[ "$require_breaking_footer" == 1 && "$failures" == "$failures_before" ]]; then
    echo "PASS: $context"
  fi
  if ((failures > failures_before)); then
    return 1
  fi
  return 0
}

lint_title() {
  local title="$1"
  if lint_header "PR/squash title" "$title"; then
    echo "PASS: PR/squash title"
  fi
}

lint_commit() {
  local commit="$1"
  local subject
  local parent_count
  local message_file="$temporary_dir/commit-message"
  local short_commit

  if ! git rev-parse --verify "${commit}^{commit}" >/dev/null 2>&1; then
    fail "commit '$commit' cannot be resolved"
    return
  fi
  commit="$(git rev-parse "${commit}^{commit}")"
  short_commit="$(git rev-parse --short "$commit")"
  parent_count="$(git rev-list --parents -n 1 "$commit" | awk '{print NF - 1}')"
  subject="$(git show -s --format=%s "$commit")"

  if ((parent_count == 0)); then
    echo "SKIP: $short_commit initial root commit"
    return
  fi
  if ((parent_count > 1)); then
    echo "SKIP: $short_commit merge commit ('$subject')"
    return
  fi
  if [[ "$subject" == 'Revert "'* ]]; then
    echo "SKIP: $short_commit Git-generated Revert commit ('$subject')"
    return
  fi

  git show -s --format=%B "$commit" > "$message_file"
  lint_message_file "commit $short_commit" "$message_file" 1 || true
}

mode=""
message_file=""
message_text=""
commit=""
base=""
head=""
pr_title=""

while (($#)); do
  case "$1" in
    --title)
      (($# >= 2)) || { echo "error: --title requires a value" >&2; exit 2; }
      [[ -z "$mode" || "$mode" == range ]] || { echo "error: --title cannot be combined with $mode" >&2; exit 2; }
      pr_title="$2"
      [[ -n "$mode" ]] || mode=title
      shift 2
      ;;
    --message-file)
      (($# >= 2)) || { echo "error: --message-file requires a path" >&2; exit 2; }
      [[ -z "$mode" ]] || { echo "error: input mode already selected: $mode" >&2; exit 2; }
      mode=message-file
      message_file="$2"
      shift 2
      ;;
    --message)
      (($# >= 2)) || { echo "error: --message requires a value" >&2; exit 2; }
      [[ -z "$mode" ]] || { echo "error: input mode already selected: $mode" >&2; exit 2; }
      mode=message
      message_text="$2"
      shift 2
      ;;
    --commit)
      (($# >= 2)) || { echo "error: --commit requires a commit-ish" >&2; exit 2; }
      [[ -z "$mode" ]] || { echo "error: input mode already selected: $mode" >&2; exit 2; }
      mode=commit
      commit="$2"
      shift 2
      ;;
    --range)
      (($# >= 3)) || { echo "error: --range requires <base> <head>" >&2; exit 2; }
      [[ -z "$mode" ]] || { echo "error: input mode already selected: $mode" >&2; exit 2; }
      mode=range
      base="$2"
      head="$3"
      shift 3
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$mode" ]]; then
  echo "error: choose --title, --message-file, --message, --commit, or --range" >&2
  usage >&2
  exit 2
fi

temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/pockettime-commit-lint.XXXXXX")"

case "$mode" in
  title)
    lint_title "$pr_title" || true
    ;;
  message-file)
    lint_message_file "commit message" "$message_file" 1 || true
    ;;
  message)
    message_file="$temporary_dir/message"
    printf '%s\n' "$message_text" > "$message_file"
    lint_message_file "commit message" "$message_file" 1 || true
    ;;
  commit)
    lint_commit "$commit"
    ;;
  range)
    if [[ -n "$pr_title" ]]; then
      lint_title "$pr_title" || true
    fi
    if ! git rev-parse --verify "${base}^{commit}" >/dev/null 2>&1; then
      fail "base '$base' cannot be resolved"
    elif ! git rev-parse --verify "${head}^{commit}" >/dev/null 2>&1; then
      fail "head '$head' cannot be resolved"
    else
      commit_count=0
      while IFS= read -r commit; do
        [[ -n "$commit" ]] || continue
        commit_count=$((commit_count + 1))
        lint_commit "$commit"
      done < <(git rev-list --reverse "${base}^{commit}..${head}^{commit}")
      echo "Checked $commit_count commit(s) in $base..$head"
    fi
    ;;
esac

if ((failures > 0)); then
  echo "Commit lint failed: $failures issue(s)" >&2
  exit 1
fi
exit 0
