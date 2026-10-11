import type { Item } from './items'
import type { Occurrence as SharedOccurrence } from '../../supabase/functions/_shared/recurrence.ts'

export { expand, occurrenceDays } from '../../supabase/functions/_shared/recurrence.ts'

/** One item as it shows up on one day. */
export type Occurrence = SharedOccurrence<Item>
