#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="${HOME}/JPLearn"
NODE_ROOT="${HOME}/.local/node"
LOCAL_BIN="${HOME}/.local/bin"
DEPLOY_ARCHIVE="${1:-/tmp/jplearn-deploy.tgz}"

mkdir -p "${HOME}/.local" "${LOCAL_BIN}"

if [[ ! -x "${NODE_ROOT}/bin/node" ]] || ! "${NODE_ROOT}/bin/node" --version | grep -q '^v22\.'; then
  checksums="$(mktemp)"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt" -o "${checksums}"
  node_archive="$(awk '$2 ~ /^node-v22.*-linux-x64.tar.xz$/ { print $2; exit }' "${checksums}")"

  if [[ -z "${node_archive}" ]]; then
    echo "Unable to determine the latest Node.js 22 Linux archive." >&2
    exit 1
  fi

  node_version="${node_archive%-linux-x64.tar.xz}"
  node_version="${node_version#node-}"
  version_dir="${HOME}/.local/node-${node_version}"

  if [[ ! -x "${version_dir}/bin/node" ]]; then
    download_dir="$(mktemp -d)"
    curl -fsSL "https://nodejs.org/dist/latest-v22.x/${node_archive}" \
      -o "${download_dir}/${node_archive}"
    (
      cd "${download_dir}"
      grep " ${node_archive}$" "${checksums}" | sha256sum --check -
    )
    mkdir -p "${version_dir}"
    tar -xJf "${download_dir}/${node_archive}" \
      --strip-components=1 \
      -C "${version_dir}"
    rm -rf "${download_dir}"
  fi

  ln -sfn "${version_dir}" "${NODE_ROOT}"
  rm -f "${checksums}"
fi

export PATH="${NODE_ROOT}/bin:${LOCAL_BIN}:${PATH}"

if ! command -v pnpm >/dev/null 2>&1; then
  npm install --global --prefix "${HOME}/.local" pnpm@11.7.0
fi

mkdir -p "${PROJECT_DIR}"
tar -xzf "${DEPLOY_ARCHIVE}" -C "${PROJECT_DIR}"
rm -f "${PROJECT_DIR}/plan/phase-1-ipv6-hello-world.md"

cd "${PROJECT_DIR}"
CI=true pnpm install --frozen-lockfile
pnpm build

current_pid="$(
  ss -ltnp 'sport = :3000' 2>/dev/null \
    | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
    | head -n 1
)"

if [[ -n "${current_pid}" ]]; then
  kill "${current_pid}"
  for _ in {1..20}; do
    if ! kill -0 "${current_pid}" 2>/dev/null; then
      break
    fi
    sleep 0.25
  done
fi

nohup pnpm start --hostname 127.0.0.1 --port 3000 \
  > /tmp/jplearn-next.log 2>&1 &
echo "$!" > /tmp/jplearn-next.pid

for _ in {1..40}; do
  if curl -fsS http://127.0.0.1:3000/ >/dev/null; then
    echo "JPLearn is running on http://127.0.0.1:3000"
    exit 0
  fi
  sleep 0.5
done

echo "JPLearn did not become ready. Recent log output:" >&2
tail -n 50 /tmp/jplearn-next.log >&2
exit 1
