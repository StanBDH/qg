import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { enAttente, triDuJour, type Item } from './tri'

type Espace = { slug: string; nom: string; groupe: 'entreprise' | 'annexe'; ordre: number; etat: string | null }

const dateDuJour = () => {
  const s = new Intl.DateTimeFormat('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const jjmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return null
  return session ? <Qg /> : <Connexion />
}

function Connexion() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [etape, setEtape] = useState<'email' | 'code'>('email')
  const [erreur, setErreur] = useState('')
  const [occupe, setOccupe] = useState(false)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    setOccupe(true); setErreur('')
    const { error } = etape === 'email'
      ? await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase() })
      : await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' })
    setOccupe(false)
    if (error) return setErreur(etape === 'email' ? "Le code n'a pas pu être envoyé. Réessaie dans une minute." : 'Code incorrect ou expiré.')
    if (etape === 'email') setEtape('code')
  }

  return (
    <main className="connexion">
      <div className="marque">QG</div>
      <form onSubmit={envoyer}>
        {etape === 'email' ? (
          <>
            <label htmlFor="email">Ton adresse e-mail</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="primaire" disabled={occupe}>Recevoir un code</button>
          </>
        ) : (
          <>
            <label htmlFor="code">Code reçu à {email}</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="primaire" disabled={occupe}>Entrer</button>
            <button type="button" className="lien" onClick={() => { setEtape('email'); setCode('') }}>Changer d'adresse</button>
          </>
        )}
        {erreur && <p className="erreur" role="alert">{erreur}</p>}
      </form>
    </main>
  )
}

function Qg() {
  const [espaces, setEspaces] = useState<Espace[] | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [filtre, setFiltre] = useState<string | null>(null)
  const [idee, setIdee] = useState('')
  const [erreur, setErreur] = useState('')

  async function charger() {
    const [e, i] = await Promise.all([
      supabase.from('qg_espaces').select('*').order('ordre'),
      supabase.from('qg_items').select('id, espace, kind, ref, title, detail, status, owner, due_on, recommandation, default_applied, created_at').in('status', ['a_faire', 'en_cours']),
    ])
    if (e.error || i.error) return setErreur('Lecture impossible. Recharge la page.')
    setEspaces(e.data as Espace[]); setItems(i.data as Item[])
  }
  useEffect(() => { charger() }, [])

  async function ecrire(requete: PromiseLike<{ error: unknown }>) {
    const { error } = await requete
    if (error) setErreur("L'enregistrement a échoué. Rien n'est perdu, réessaie.")
    else { setErreur(''); charger() }
  }
  const repondre = (i: Item, reponse: string) => ecrire(supabase.from('qg_items').update({ answer: reponse }).eq('id', i.id))
  const fait = (i: Item) => ecrire(supabase.from('qg_items').update({ status: 'fait' }).eq('id', i.id))
  async function ranger(e: FormEvent) {
    e.preventDefault()
    const texte = idee.trim()
    if (!texte) return
    await ecrire(supabase.from('qg_items').insert({
      espace: filtre ?? 'qg', kind: 'idee', status: 'idee', owner: 'stan',
      title: texte.length > 200 ? texte.slice(0, 197) + '...' : texte,
      detail: texte.length > 200 ? texte : null,
    }))
    setIdee('')
  }

  if (espaces === null) return erreur ? <p className="erreur">{erreur}</p> : null
  if (espaces.length === 0) return (
    <main className="connexion"><div className="marque">QG</div><p>Cette adresse n'a pas accès au QG.</p>
      <button className="lien" onClick={() => supabase.auth.signOut()}>Se déconnecter</button></main>
  )

  const nom = (slug: string) => espaces.find((e) => e.slug === slug)?.nom ?? slug
  const attente = enAttente(items)
  const compte = (slug: string) => attente.filter((i) => i.espace === slug).length
  const { jour, reste } = triDuJour(filtre ? items.filter((i) => i.espace === filtre) : items)
  const decisions = jour.filter((i) => i.kind === 'question')
  const gestes = jour.filter((i) => i.kind === 'geste')

  const lienEspace = (e: Espace) => (
    <li key={e.slug}>
      <button className={filtre === e.slug ? 'actif' : ''} aria-pressed={filtre === e.slug} onClick={() => setFiltre(filtre === e.slug ? null : e.slug)}>
        <span>{e.nom}</span>{compte(e.slug) > 0 && <span className="compte">{compte(e.slug)}</span>}
      </button>
    </li>
  )

  return (
    <div className="qg">
      <header>
        <div className="marque">QG</div>
        <div className="date">{dateDuJour()}</div>
        <button className="lien deconnexion" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </header>
      <div className="corps">
        <nav aria-label="Espaces">
          <button className={filtre === null ? 'actif tout' : 'tout'} onClick={() => setFiltre(null)}>
            <span>Aujourd'hui</span><span className="compte">{attente.length}</span>
          </button>
          <h2>Entreprises</h2>
          <ul>{espaces.filter((e) => e.groupe === 'entreprise').map(lienEspace)}</ul>
          <h2>Projets annexes</h2>
          <ul>{espaces.filter((e) => e.groupe === 'annexe').map(lienEspace)}</ul>
        </nav>
        <main>
          <h1>{filtre ? nom(filtre) : "Ce qui t'attend"}</h1>
          <p className="chapeau">
            {jour.length === 0 ? 'Rien ne t’attend ici.' : `Tri du jour : ${jour.length} élément${jour.length > 1 ? 's' : ''}, les décisions d'abord.`}
            {reste > 0 && ` ${reste} autre${reste > 1 ? 's' : ''} attend${reste > 1 ? 'ent' : ''} leur tour.`}
          </p>
          {erreur && <p className="erreur" role="alert">{erreur}</p>}

          {decisions.length > 0 && <h2 className="section">Décider <span className="compte">{decisions.length}</span></h2>}
          {decisions.map((i) => <Decision key={i.id} item={i} espace={nom(i.espace)} onRepondre={repondre} />)}

          {gestes.length > 0 && <h2 className="section">Faire <span className="compte">{gestes.length}</span></h2>}
          {gestes.map((i) => (
            <div className="ligne" key={i.id}>
              <div className="espace">{nom(i.espace)}</div>
              <div className="texte">{i.title}{i.detail && <div className="sous">{i.detail}</div>}</div>
              <div className="quand">{i.due_on ? `avant le ${jjmm(i.due_on)}` : `depuis le ${jjmm(i.created_at)}`}</div>
              <button className="secondaire" onClick={() => fait(i)}>Fait</button>
            </div>
          ))}

          <form className="capture" onSubmit={ranger}>
            <label htmlFor="idee">Noter une idée ou une consigne{filtre ? ` pour ${nom(filtre)}` : ''}</label>
            <div>
              <input id="idee" value={idee} onChange={(e) => setIdee(e.target.value)} placeholder="Dicte ou écris" />
              <button className="accent">Ranger</button>
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}

function Decision({ item, espace, onRepondre }: { item: Item; espace: string; onRepondre: (i: Item, r: string) => void }) {
  const [autre, setAutre] = useState<string | null>(null)
  return (
    <div className="ligne">
      <div className="espace">{espace}{item.ref && <div className="ref">{item.ref}</div>}</div>
      <div className="texte">
        <strong>{item.title}</strong>
        {item.detail && <div className="sous">{item.detail}</div>}
        {item.recommandation && <div className="sous">Ma recommandation : {item.recommandation}</div>}
        {autre !== null && (
          <form className="autre" onSubmit={(e) => { e.preventDefault(); if (autre.trim()) onRepondre(item, autre.trim()) }}>
            <label htmlFor={`r-${item.id}`}>Ta réponse</label>
            <textarea id={`r-${item.id}`} rows={2} value={autre} onChange={(e) => setAutre(e.target.value)} autoFocus />
            <button className="primaire">Envoyer</button>
          </form>
        )}
      </div>
      {autre === null && (
        <div className="actions">
          {item.recommandation && <button className="primaire" onClick={() => onRepondre(item, `Validé : ${item.recommandation}`)}>Valider</button>}
          <button className="secondaire" onClick={() => setAutre('')}>{item.recommandation ? 'Autre réponse' : 'Répondre'}</button>
        </div>
      )}
    </div>
  )
}
