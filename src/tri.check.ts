// Contrôle du tri du jour : node src/tri.check.ts
import assert from 'node:assert/strict'
import { triDuJour, type Item } from './tri.ts'

const base = { espace: 'qg', ref: null, detail: null, status: 'a_faire', owner: 'stan', due_on: null, recommandation: null, default_applied: null }
const it = (id: string, kind: string, created_at: string, extra: Partial<Item> = {}): Item => ({ ...base, id, kind, title: id, created_at, ...extra })

const { jour, reste } = triDuJour([
  it('geste-ancien', 'geste', '2026-10-01'),
  it('geste-echeance', 'geste', '2026-10-20', { due_on: '2026-10-25' }),
  it('question', 'question', '2026-10-21'),
  it('fait', 'geste', '2026-09-01', { status: 'fait' }),
  it('claude', 'tache', '2026-09-01', { owner: 'claude' }),
  it('idee', 'idee', '2026-09-01', { status: 'idee' }),
  ...Array.from({ length: 6 }, (_, n) => it(`g${n}`, 'geste', `2026-10-1${n}`)),
])

assert.deepEqual(jour.map((i) => i.id).slice(0, 3), ['question', 'geste-echeance', 'geste-ancien'])
assert.equal(jour.length, 7)
assert.equal(reste, 2)
console.log('tri du jour : ok')
