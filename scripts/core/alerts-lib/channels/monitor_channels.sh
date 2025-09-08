#!/usr/bin/env bash

source "$(dirname "$0")/email.sh"
source "$(dirname "$0")/slack.sh"
source "$(dirname "$0")/telegram.sh"

for channel in email slack telegram; do
  test_func="test_${channel}_channel"
  if $test_func; then
    echo "🟢 $channel OK"
  else
    echo "🔴 $channel OFFLINE"
  fi
done
