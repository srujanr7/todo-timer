#!/bin/sh
ns=$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf)
[ -z "$ns" ] && ns=8.8.8.8
case "$ns" in *:*) ns="[$ns]" ;; esac
echo "resolver $ns valid=30s ipv6=off;" > /etc/nginx/deployinn-resolver.conf
