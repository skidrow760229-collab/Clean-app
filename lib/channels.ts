export const GROUP_CHANNELS = [
  { id: "global", label: "Global Floor" },
  { id: "contracts", label: "Open Contracts" },
  { id: "research", label: "Research Guild" },
]

export const GROUP_CHANNEL_IDS = GROUP_CHANNELS.map((c) => c.id)

/** Builds the canonical DM channel id for two usernames (order-independent). */
export function dmChannelId(a: string, b: string) {
  return `dm:${[a, b].sort().join("::")}`
}

/** Verifies a username is permitted to access a channel. */
export function canAccessChannel(channel: string, username: string) {
  if (GROUP_CHANNEL_IDS.includes(channel)) return true
  if (channel.startsWith("dm:")) {
    const parts = channel.slice(3).split("::")
    return parts.length === 2 && parts.includes(username)
  }
  return false
}
