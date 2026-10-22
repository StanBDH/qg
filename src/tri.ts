export type Item = {
  id: string
  espace: string
  kind: string
  ref: string | null
  title: string
  detail: string | null
  status: string
  owner: string
  due_on: string | null
  recommandation: string | null
  default_applied: string | null
  created_at: string
}

export const MAX_DU_JOUR = 7

// Ce qui attend Stan : ses questions et ses gestes ouverts.
export const enAttente = (items: Item[]) =>
  items.filter((i) => i.owner === 'stan' && (i.status === 'a_faire' || i.status === 'en_cours') && (i.kind === 'question' || i.kind === 'geste'))

// Tri du jour : les décisions d'abord (elles débloquent les sessions), puis l'échéance la plus proche, puis le plus ancien.
// ponytail: tri par règles fixes ; un score (blocages, urgence déclarée) quand ces règles ne suffiront plus.
export function triDuJour(items: Item[]): { jour: Item[]; reste: number } {
  const ouverts = enAttente(items).sort((a, b) =>
    Number(b.kind === 'question') - Number(a.kind === 'question')
    || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999')
    || a.created_at.localeCompare(b.created_at))
  return { jour: ouverts.slice(0, MAX_DU_JOUR), reste: Math.max(0, ouverts.length - MAX_DU_JOUR) }
}
