# QG de Stan

Interface unique où Stan lit et tranche ce qui l'attend dans tous ses espaces : Futur, BatiMetric, KSG Connect, KSG Solutions, le livre (Chronique d'une Pensée Incomplète) et les projets annexes. Direction visuelle validée le 22.10.2026 : A « Tableau de service » (planche https://claude.ai/artifact/WPQDbYT5ZCpGKYPmygE6Vx).

## Pile

Vite + React + TypeScript, `@supabase/supabase-js`. Aucune autre dépendance sans raison écrite.
- Base : Supabase, organisation propre au QG (plan gratuit), région Zurich. Schéma : `supabase/migrations/`.
- Hébergement : Vercel Hobby, compte personnel de Stan. Jamais l'équipe Vercel « KSG Connect », jamais l'organisation Supabase « ksgsolutions.ch » (cloisonnement : facture de KSG).
- Accès : code à usage unique par e-mail (Supabase Auth). La RLS n'ouvre les tables qu'aux adresses de `qg_acces`.
- Contrôles : `npm run build` (typage + build) et `node src/tri.check.ts`.

## Écrire dans le QG depuis une session (étape 1 et suivantes)

Mêmes gestes que la console KSG, avec l'espace en premier paramètre. Par le connecteur Supabase (`execute_sql`), jamais depuis une autre application. Auteur : « Claude · <titre de la session> ». Jamais de secret dans le QG.

- Idée : `select qg_ajouter('<espace>', 'idee', '<titre>', 'Claude · <session>', p_detail => '<détail>');`
- Question pour Stan : `select qg_ajouter('<espace>', 'question', '<question>', 'Claude · <session>', p_detail => '<contexte>', p_reco => '<recommandation>', p_defaut => '<défaut appliqué>', p_parent => '<ref>', p_bloque => '<ref bloquée>');`
- Geste attendu de Stan : `select qg_ajouter('<espace>', 'geste', '<geste>', 'Claude · <session>', p_echeance => '<date>');`
- Avancement : `select qg_changer('<ref>', 'Claude · <session>', p_statut => 'fait', p_avancement => 60, p_note => '<commit, résultat>');`
- Avant de poser une question, chercher la réponse : `select ref, title, answer, answered_at from qg_items where kind = 'question' and answer is not null order by answered_at desc;`

Espaces : `futur`, `batimetric`, `ksg-connect`, `ksg-solutions`, `livre`, `personal-branding`, `agent-reseaux`, `famille-schaerer`, `qg`.

## Règles

- Le tri du jour (`src/tri.ts`) montre 7 éléments au plus, les décisions d'abord. Ne pas le contourner en affichant tout.
- Mise en ligne seulement après le « OK » de Stan, avec une capture.
