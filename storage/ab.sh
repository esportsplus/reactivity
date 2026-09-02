#!/usr/bin/env bash
# Interleaved N-way A/B in a dedicated worktree.
# Usage: DIR=/d/reactivity-ab OUT=storage/ab ROUNDS=4 bash storage/ab.sh name=rev name=rev ... -- <bench files...>
# Sides alternate in the given order each round; reverse the order for a second run to cancel ordering bias.
set -e
dir=${DIR:-/d/reactivity-ab}
out=${OUT:-storage/ab}
rounds=${ROUNDS:-4}
start=${ROUND_START:-1}
sides=()

while [ "$1" != "--" ]; do
    sides+=("$1")
    shift
done

shift
files=("$@")
root=$(pwd)

mkdir -p "$root/$out"
cd "$dir"

for r in $(seq "$start" $((start + rounds - 1))); do
    for side in "${sides[@]}"; do
        name=${side%%=*}
        rev=${side#*=}
        git checkout -q --detach "$rev"
        npx vitest bench --run "${files[@]}" --outputJson "$root/$out/$name-$r.json" > "$root/$out/$name-$r.log" 2>&1 || echo "FAILED $name $r"
        echo "done $name $r"
    done
done

echo "AB COMPLETE"
