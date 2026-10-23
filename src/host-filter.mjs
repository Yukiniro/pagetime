export function filterHosts(hosts, query) {
  const needle = query.trim().toLowerCase();
  return needle ? hosts.filter(host => host.includes(needle)) : hosts;
}
