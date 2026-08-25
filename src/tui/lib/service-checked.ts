import type { ServiceState } from '@/shared/types/protocol'

/** Whether the dashboard toggle appears checked (matches service-table). */
export const isServiceChecked = (state: ServiceState, online: boolean): boolean => {
  const desiredUp = state.entry.desired === 'up'
  return desiredUp && (!online || state.status !== 'pending')
}
