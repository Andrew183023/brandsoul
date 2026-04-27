import type { ManifestationIntensity, ManifestationMode } from '../../../domain/rendering/contracts/types'
import type { PersonaDNA } from '../../../domain/persona-dna/contracts/PersonaDNA'
import { resolvePersonaDNAModulators } from '../../../domain/persona-dna/services/resolvePersonaDNAModulators'
import type { EntityFinalForm } from '../../../domain/entity/contracts/EntityFinalForm'

export type BirthNarrativeAct = 'origin' | 'reading' | 'metamorphosis' | 'incarnation'

export const birthSequenceTimings = {
  buildingMs: 1100,
  transitionMs: 2200,
  finalMs: 3300,
} as const

type RitualActNarrative = {
  eyebrow: string
  title: string
  detail: string
}

type FusionRitualModel = {
  eyebrow: string
  title: string
  detail: string
  signals: [string, string, string, string]
  styleVars: Record<string, string>
}

type FinalPresenceModel = {
  eyebrow: string
  title: string
  detail: string
  impactCopy: string
  signals: [string, string, string, string, string]
  styleVars: Record<string, string>
}

type SocialExportModel = {
  headline: string
  description: string
  entityType: string
  intensityLabel: string
  postureLabel: string
  signatureText: string
  previewTitle: string
  previewDescription: string
  kicker: string
  ctaText: string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function resolveToneLabel(personaDNA?: PersonaDNA) {
  if (!personaDNA) {
    return 'Ritual de ativação'
  }

  if (personaDNA.temperament === 'ritual') {
    return personaDNA.presenceStyle === 'dominant' ? 'Ritual cerimonial de presença' : 'Ritual cerimonial de encarnação'
  }
  if (personaDNA.temperament === 'calm') {
    return personaDNA.presenceStyle === 'reserved' ? 'Ritual estável e reservado' : 'Ritual estável de presença'
  }
  if (personaDNA.temperament === 'intense') {
    return personaDNA.presenceStyle === 'dominant' ? 'Ritual incisivo de afirmação' : 'Ritual incisivo de emergência'
  }
  return personaDNA.presenceStyle === 'dominant' ? 'Ritual dinâmico de afirmação' : 'Ritual dinâmico de redistribuição'
}

function resolveActEyebrow(base: string, personaDNA?: PersonaDNA) {
  if (!personaDNA) {
    return base
  }

  const tone =
    personaDNA.temperament === 'ritual'
      ? 'Cerimônia'
      : personaDNA.temperament === 'calm'
        ? 'Estabilização'
        : personaDNA.temperament === 'intense'
          ? 'Pressão'
          : 'Redistribuição'

  return `${base} · ${tone}`
}

function resolveHeadline(args: { act: BirthNarrativeAct; personaDNA?: PersonaDNA }) {
  const { act, personaDNA } = args
  if (!personaDNA) {
    switch (act) {
      case 'origin':
        return 'O símbolo entra como matéria inicial'
      case 'reading':
        return 'Contorno, centro e eixo entram em varredura'
      case 'metamorphosis':
        return 'A identidade deixa de ser logo e vira corpo vivo'
      case 'incarnation':
        return 'O núcleo estabiliza e a presença assume forma hero'
    }
  }

  const byAct: Record<BirthNarrativeAct, string> = {
    origin:
      personaDNA.temperament === 'calm'
        ? 'A matéria entra com disciplina e preserva leitura'
        : personaDNA.temperament === 'intense'
          ? 'A matéria entra sob pressão e já anuncia presença'
          : personaDNA.temperament === 'ritual'
            ? 'A matéria entra com solenidade e intenção formal'
            : 'A matéria entra em movimento e redistribui sua leitura',
    reading:
      personaDNA.precision === 'precise'
        ? 'Centro, eixo e massa são lidos com precisão declarada'
        : personaDNA.precision === 'organic'
          ? 'A leitura encontra ritmo, respiração e coerência interna'
          : 'O laboratório lê geometria, peso e intenção da marca',
    metamorphosis:
      personaDNA.temperament === 'intense'
        ? 'A forma colapsa, reage e recompõe presença com força'
        : personaDNA.temperament === 'ritual'
          ? 'A forma atravessa a transição com controle e solenidade'
          : personaDNA.temperament === 'dynamic'
            ? 'A forma se redistribui até encontrar um corpo convincente'
            : 'A forma troca rigidez por presença e mantém coerência estrutural',
    incarnation:
      personaDNA.presenceStyle === 'dominant'
        ? 'O núcleo fecha a leitura e a presença assume autoridade visual'
        : personaDNA.presenceStyle === 'reserved'
          ? 'O núcleo estabiliza com contenção e presença precisa'
          : 'O núcleo estabiliza e a presença assume forma pública',
  }

  return byAct[act]
}

function resolveDetail(args: {
  act: BirthNarrativeAct
  stageId?: string
  personaDNA?: PersonaDNA
}) {
  const { act, stageId, personaDNA } = args
  if (!personaDNA) {
    switch (act) {
      case 'origin':
        return 'O logo permanece reconhecível. A presença ainda não tomou o corpo, mas a matéria visual já está posicionada para ser lida.'
      case 'reading':
        return `O laboratório interpreta a geometria da marca${stageId ? ` no estágio ${stageId}` : ''}, revelando massa, ritmo e centro de energia.`
      case 'metamorphosis':
        return 'A forma se fragmenta e se recompõe obedecendo à silhueta e ao comportamento estrutural do símbolo original.'
      case 'incarnation':
        return 'A entidade conclui o nascimento com respiração visual, aura controlada e um quadro final pronto para se tornar presença pública.'
    }
  }

  if (act === 'origin') {
    return personaDNA.presenceStyle === 'reserved'
      ? 'A marca entra sem ruído desnecessário. A leitura inicial preserva elegância, contorno e margem de controle.'
      : personaDNA.presenceStyle === 'dominant'
        ? 'A marca entra inteira, mas já com peso de decisão. A interface prepara um nascimento que não pede licença para ser notado.'
        : 'A marca entra íntegra, com leitura clara e matéria suficiente para sustentar uma presença convincente.'
  }

  if (act === 'reading') {
    return personaDNA.temperament === 'ritual'
      ? `A leitura ${stageId ? `do estágio ${stageId}` : 'estrutural'} ocorre com cadência controlada, revelando centro, massa e eixo antes da transformação.`
      : personaDNA.temperament === 'intense'
        ? `O laboratório extrai pressão, massa e direção${stageId ? ` em ${stageId}` : ''}, preparando uma emergência mais incisiva.`
        : `A leitura ${stageId ? `do estágio ${stageId}` : 'estrutural'} revela geometria, distribuição e disciplina suficientes para orientar o nascimento da entidade.`
  }

  if (act === 'metamorphosis') {
    return personaDNA.temperament === 'dynamic'
      ? 'A forma entra em redistribuição controlada. O símbolo perde rigidez sem perder assinatura, e o corpo novo aparece por reorganização interna.'
      : personaDNA.temperament === 'intense'
        ? 'A forma entra em colapso orientado e retorna com mais tensão, contraste e decisão de presença.'
        : personaDNA.temperament === 'ritual'
          ? 'A transição preserva solenidade: a forma se reescreve sem ruído, como se cada camada obedecesse a uma ordem anterior.'
          : 'A forma troca leitura estática por corpo vivo, mantendo coerência com a silhueta e o centro estrutural do símbolo.'
  }

  return personaDNA.presenceStyle === 'dominant'
    ? 'A entidade fecha o ritual com núcleo afirmativo, campo disciplinado e presença pronta para ocupar o quadro com autoridade.'
    : personaDNA.presenceStyle === 'reserved'
      ? 'A entidade conclui o nascimento com contenção, clareza e uma presença elegante que sustenta leitura sem excesso.'
      : 'A entidade conclui o nascimento com equilíbrio entre núcleo, campo e leitura pública.'
}

function resolveBirthMessageVariant(args: {
  act: BirthNarrativeAct
  personaDNA?: PersonaDNA
  mode?: ManifestationMode
  variant?: string
}) {
  const { act, personaDNA, mode, variant } = args
  const manifestationHint =
    mode === 'elemental'
      ? variant === 'fogo'
        ? 'O calor do modo atual amplia o impulso sem comprometer leitura.'
        : variant === 'agua'
          ? 'O fluxo do modo atual alonga a passagem entre forma e presença.'
          : variant === 'terra'
            ? 'O peso do modo atual sustenta uma encarnação mais densa.'
            : 'O deslocamento do modo atual favorece transição e amplitude.'
      : mode === 'natureza'
        ? 'O modo atual preserva crescimento, respiração e continuidade.'
        : mode === 'robo-ia'
          ? 'O modo atual mantém a leitura limpa, técnica e disciplinada.'
          : 'O modo atual mantém pressão luminosa e fechamento energético.'

  if (!personaDNA) {
    return undefined
  }

  if (act === 'origin') {
    return personaDNA.temperament === 'ritual'
      ? 'A origem ainda é marca. O ritual apenas começa a estabelecer intenção e postura.'
      : personaDNA.temperament === 'intense'
        ? 'A origem já entra carregando decisão. Nada aqui soa neutro ou provisório.'
        : personaDNA.temperament === 'dynamic'
          ? 'A origem entra legível, mas já deixa claro que não permanecerá imóvel.'
          : 'A origem entra inteira, segura e pronta para sustentar uma leitura premium.'
  }

  if (act === 'reading') {
    return `${manifestationHint} ${personaDNA.precision === 'precise' ? 'A leitura privilegia disciplina e recorte.' : personaDNA.precision === 'organic' ? 'A leitura privilegia ritmo e continuidade.' : 'A leitura privilegia equilíbrio entre forma e intenção.'}`
  }

  if (act === 'metamorphosis') {
    return personaDNA.temperament === 'intense'
      ? 'O corpo novo aparece por tensão e resolução, não por ornamento.'
      : personaDNA.temperament === 'dynamic'
        ? 'A identidade se recompõe por redistribuição, mantendo assinatura e ganhando mobilidade.'
        : personaDNA.temperament === 'ritual'
          ? 'A mudança parece deliberada, quase protocolar, sem cair em fantasia vazia.'
          : 'A mudança preserva silêncio, clareza e estrutura enquanto a presença ganha corpo.'
  }

  return personaDNA.presenceStyle === 'dominant'
    ? 'O payoff final é afirmativo: a entidade não só aparece, ela se estabelece.'
    : personaDNA.presenceStyle === 'reserved'
      ? 'O payoff final é contido: a entidade se impõe por precisão, não por excesso.'
      : 'O payoff final fecha o ritual com presença clara, estável e publicamente legível.'
}

export function getManifestationBirthMessages(
  mode?: ManifestationMode,
  variant?: string,
  personaDNA?: PersonaDNA,
): [string, string, string, string] {
  return [
    resolveBirthMessageVariant({ act: 'origin', personaDNA, mode, variant }) ?? 'A origem visual entra intacta como matéria inicial da entidade.',
    resolveBirthMessageVariant({ act: 'reading', personaDNA, mode, variant }) ?? 'O laboratório lê contorno, centro e pulsação interna do símbolo.',
    resolveBirthMessageVariant({ act: 'metamorphosis', personaDNA, mode, variant }) ?? 'A forma abandona o estado de logo e entra em metamorfose dirigida.',
    resolveBirthMessageVariant({ act: 'incarnation', personaDNA, mode, variant }) ?? 'A entidade estabiliza e assume sua primeira presença hero.',
  ]
}

export function getBirthActNarrative(args: {
  act: BirthNarrativeAct
  stageId?: string
  personaDNA?: PersonaDNA
}): RitualActNarrative {
  const { act, stageId, personaDNA } = args

  return {
    eyebrow: resolveActEyebrow(
      act === 'origin' ? 'Origem' : act === 'reading' ? 'Leitura' : act === 'metamorphosis' ? 'Metamorfose' : 'Encarnação',
      personaDNA,
    ),
    title: resolveHeadline({ act, personaDNA }),
    detail: resolveDetail({ act, stageId, personaDNA }),
  }
}

export function getBirthSignalLines(args: {
  personaDNA?: PersonaDNA
  stageId?: string
  progress: number
}): [string, string] {
  const toneLine = args.personaDNA
    ? `${resolveToneLabel(args.personaDNA)}`
    : 'Ritual em preparação'
  const progressLine = `${args.stageId ? `estágio ${args.stageId}` : 'timeline em preparação'} · progresso hero ${Math.round(args.progress * 100)}%`

  return [toneLine, progressLine]
}

export function getBirthActLabels(): Array<{ id: BirthNarrativeAct; label: string; title: string }> {
  return [
    { id: 'origin', label: 'Ato 1', title: 'Origem' },
    { id: 'reading', label: 'Ato 2', title: 'Leitura' },
    { id: 'metamorphosis', label: 'Ato 3', title: 'Metamorfose' },
    { id: 'incarnation', label: 'Ato 4', title: 'Encarnação' },
  ]
}

export function getManifestationFusionCopy(mode?: ManifestationMode, variant?: string) {
  if (mode === 'centelha') {
    return 'O logo se desfaz em partículas luminosas, a energia se concentra e a presença final nasce como uma faísca viva da marca.'
  }

  if (mode === 'elemental') {
    if (variant === 'agua') {
      return 'O logo é absorvido por fluxo e corrente. A identidade deixa de ser forma estática e vira movimento líquido com presença.'
    }

    if (variant === 'fogo') {
      return 'O logo incandesce, queima e reaparece com mais impulso. A entidade final nasce com calor, ação e temperamento.'
    }

    if (variant === 'terra') {
      return 'O logo mineraliza, ganha peso e emerge como matéria viva. A presença final parece esculpida, firme e inevitável.'
    }

    if (variant === 'ar') {
      return 'O logo se desfaz no vento, se redistribui e retorna com leveza ativa. A entidade final nasce de deslocamento e presença aérea.'
    }
  }

  if (mode === 'natureza') {
    return 'O logo germina, ramifica e brota como uma presença orgânica. A forma final parece viva, fértil e silenciosamente poderosa.'
  }

  if (mode === 'robo-ia') {
    return 'O logo entra em scan, passa por grade e reconstrução luminosa, e reaparece como uma entidade tecnológica precisa e presente.'
  }

  return 'O logo entra como matéria-prima. O modo escolhido define como a marca será reencarnada visualmente.'
}

function resolveFusionModeHint(mode?: ManifestationMode, variant?: string) {
  if (mode === 'elemental') {
    if (variant === 'agua') {
      return 'O modo atual mantém fluidez e continuidade na transferência entre símbolo e corpo.'
    }
    if (variant === 'fogo') {
      return 'O modo atual injeta pressão, calor e decisão no acoplamento.'
    }
    if (variant === 'terra') {
      return 'O modo atual sustenta densidade, permanência e peso de forma.'
    }
    if (variant === 'ar') {
      return 'O modo atual favorece deslocamento, leveza e expansão controlada.'
    }
  }

  if (mode === 'natureza') {
    return 'O modo atual preserva continuidade orgânica, crescimento e aderência silenciosa.'
  }

  if (mode === 'robo-ia') {
    return 'O modo atual mantém recorte técnico, cadência limpa e precisão estrutural.'
  }

  if (mode === 'centelha') {
    return 'O modo atual concentra energia e fecha o acoplamento por núcleo e impulso.'
  }

  return 'O modo atual sustenta a transição entre origem visual e presença viva.'
}

export function getFusionRitualModel(args: {
  mode?: ManifestationMode
  variant?: string
  intensity: ManifestationIntensity
  personaDNA?: PersonaDNA
}): FusionRitualModel {
  const { mode, variant, intensity, personaDNA } = args
  const modeHint = resolveFusionModeHint(mode, variant)

  if (!personaDNA) {
    return {
      eyebrow: 'Fusão de identidade',
      title: 'O símbolo deixa de ser origem isolada e entra em acoplamento com o corpo vivo',
      detail: `${getManifestationFusionCopy(mode, variant)} ${modeHint}`,
      signals: [
        'ritmo de fusão balanceado',
        'ruptura visual moderada',
        'acoplamento estrutural em andamento',
        'núcleo em estabilização',
      ],
      styleVars: {
        '--persona-lab-fusion-rhythm': intensity === 'cinematic' ? '0.9' : intensity === 'soft' ? '1.08' : '1',
        '--persona-lab-fusion-fracture': intensity === 'cinematic' ? '0.58' : intensity === 'soft' ? '0.28' : '0.42',
        '--persona-lab-fusion-containment': intensity === 'soft' ? '0.66' : '0.54',
        '--persona-lab-fusion-discipline': '0.58',
        '--persona-lab-fusion-coupling': intensity === 'cinematic' ? '0.74' : '0.58',
        '--persona-lab-fusion-core-presence': intensity === 'cinematic' ? '0.78' : '0.6',
        '--persona-lab-fusion-lift': '8',
      },
    }
  }

  const modulators = resolvePersonaDNAModulators(personaDNA)
  const intensityBias = intensity === 'cinematic' ? 0.12 : intensity === 'soft' ? -0.08 : 0
  const rhythmFactor =
    personaDNA.temperament === 'intense'
      ? 0.84
      : personaDNA.temperament === 'dynamic'
        ? 0.94
        : personaDNA.temperament === 'ritual'
          ? 1.06
          : 1.14
  const fracture = clamp(
    personaDNA.temperament === 'intense'
      ? 0.76
      : personaDNA.temperament === 'dynamic'
        ? 0.58
        : personaDNA.temperament === 'ritual'
          ? 0.34
          : 0.22,
    0.12,
    0.88,
  )
  const discipline = clamp(0.42 + personaDNA.stability * 0.18 + (personaDNA.precision === 'precise' ? 0.2 : personaDNA.precision === 'organic' ? -0.08 : 0), 0.22, 0.92)
  const coupling = clamp(0.42 + personaDNA.charisma * 0.18 + (personaDNA.presenceStyle === 'dominant' ? 0.14 : personaDNA.presenceStyle === 'reserved' ? -0.06 : 0) + intensityBias, 0.18, 0.94)
  const corePresence = clamp(0.38 + personaDNA.charisma * 0.14 + (personaDNA.presenceStyle === 'dominant' ? 0.18 : personaDNA.presenceStyle === 'reserved' ? -0.08 : 0) + modulators.coreRadiusBias * 0.6, 0.2, 0.94)
  const containment = clamp(modulators.containment + (personaDNA.presenceStyle === 'reserved' ? 0.08 : personaDNA.presenceStyle === 'dominant' ? -0.08 : 0), 0.18, 0.94)

  const eyebrow =
    personaDNA.temperament === 'ritual'
      ? 'Fusão cerimonial'
      : personaDNA.temperament === 'intense'
        ? 'Fusão de pressão'
        : personaDNA.temperament === 'calm'
          ? 'Fusão estável'
          : 'Fusão em redistribuição'

  const title =
    personaDNA.temperament === 'calm'
      ? 'O símbolo entra no corpo vivo com suavidade, estabilidade e leitura limpa'
      : personaDNA.temperament === 'intense'
        ? 'O símbolo entra com decisão, acelera o acoplamento e afirma presença'
        : personaDNA.temperament === 'ritual'
          ? 'O símbolo atravessa a fusão por progressão precisa, sem perder postura'
          : 'O símbolo se redistribui até encontrar um acoplamento vivo e convincente'

  const detail =
    personaDNA.presenceStyle === 'reserved'
      ? `${modeHint} A fusão preserva margem, contenção e clareza. O símbolo não desaparece em espetáculo; ele é absorvido com controle.`
      : personaDNA.presenceStyle === 'dominant'
        ? `${modeHint} A fusão fecha mais perto do núcleo e entrega uma presença afirmativa. O acoplamento precisa parecer inevitável, não apenas bonito.`
        : `${modeHint} A fusão busca equilíbrio entre leitura da origem, aderência estrutural e presença pública.`

  const rhythmLabel =
    personaDNA.temperament === 'calm'
      ? 'ritmo suave, estável e elegante'
      : personaDNA.temperament === 'intense'
        ? 'ritmo rápido, energético e incisivo'
        : personaDNA.temperament === 'ritual'
          ? 'ritmo progressivo, preciso e cerimonial'
          : 'ritmo móvel, contínuo e adaptativo'
  const ruptureLabel =
    fracture >= 0.66
      ? 'ruptura afirmativa com recomposição curta'
      : fracture <= 0.3
        ? 'transição suave com ruptura mínima'
        : 'transição controlada entre forma e corpo'
  const containmentLabel =
    containment >= 0.7
      ? 'acoplamento contido e bem guardado'
      : containment <= 0.34
        ? 'acoplamento expansivo e aberto'
        : 'acoplamento equilibrado entre retenção e abertura'
  const coreLabel =
    corePresence >= 0.72
      ? 'núcleo claramente presente durante a fusão'
      : corePresence <= 0.42
        ? 'núcleo discreto, sem dominar a transição'
        : 'núcleo ativo, mas ainda disciplinado'

  return {
    eyebrow,
    title,
    detail,
    signals: [
      rhythmLabel,
      ruptureLabel,
      `${discipline >= 0.72 ? 'disciplina visual alta' : discipline <= 0.42 ? 'disciplina visual flexível' : 'disciplina visual balanceada'}`,
      `${containmentLabel} · ${coreLabel}`,
    ],
    styleVars: {
      '--persona-lab-fusion-rhythm': clamp(rhythmFactor + (intensity === 'cinematic' ? -0.08 : intensity === 'soft' ? 0.08 : 0), 0.74, 1.2).toFixed(3),
      '--persona-lab-fusion-fracture': fracture.toFixed(3),
      '--persona-lab-fusion-containment': containment.toFixed(3),
      '--persona-lab-fusion-discipline': discipline.toFixed(3),
      '--persona-lab-fusion-coupling': coupling.toFixed(3),
      '--persona-lab-fusion-core-presence': corePresence.toFixed(3),
      '--persona-lab-fusion-lift': clamp(8 + (personaDNA.presenceStyle === 'dominant' ? 6 : personaDNA.presenceStyle === 'reserved' ? 1 : 3) - modulators.postureLift, 3, 18).toFixed(2),
    },
  }
}

export function getManifestationFinalQuote(mode?: ManifestationMode, personaDNA?: PersonaDNA) {
  if (personaDNA?.presenceStyle === 'dominant') {
    return 'Your entity now enters the world with clear authority.'
  }
  if (personaDNA?.presenceStyle === 'reserved') {
    return 'Your entity now enters the world with controlled clarity.'
  }
  if (personaDNA?.temperament === 'ritual') {
    return 'Your entity now enters the world with composed intention.'
  }

  switch (mode) {
    case 'centelha':
      return 'Your living spark has taken form.'
    case 'elemental':
      return 'Your brand now moves with force and matter.'
    case 'natureza':
      return 'Your presence now feels alive and rooted.'
    case 'robo-ia':
      return 'Your brand now thinks in luminous structure.'
    default:
      return 'I’m ready to represent your brand.'
  }
}

export function getFinalPresenceModel(args: {
  mode?: ManifestationMode
  personaDNA?: PersonaDNA
  finalForm?: EntityFinalForm
}): FinalPresenceModel {
  const { mode, personaDNA, finalForm } = args

  if (!personaDNA) {
    return {
      eyebrow: 'Presença pública',
      title: 'A entidade conclui o ritual com leitura estável e forma pública consistente',
      detail: 'O estado final preserva forma, núcleo e campo em equilíbrio suficiente para circulação pública.',
      impactCopy: 'Leve esta presença para o mundo com uma imagem pronta para circular, sem romper a identidade construída no ritual.',
      signals: [
        'contenção equilibrada',
        'disciplina visual estável',
        'presença pública legível',
        'núcleo consistente',
        'postura centralizada',
      ],
      styleVars: {
        '--persona-lab-final-rhythm': '1',
        '--persona-lab-final-containment': '0.56',
        '--persona-lab-final-discipline': '0.6',
        '--persona-lab-final-core-presence': '0.66',
        '--persona-lab-final-field-presence': '0.48',
        '--persona-lab-final-occupancy': '0.58',
        '--persona-lab-final-posture-lift': '8',
        '--persona-lab-final-stability': '0.72',
      },
    }
  }

  const modulators = resolvePersonaDNAModulators(personaDNA)
  const containment = clamp((finalForm?.smearReduction ?? 0.78) * 0.72 + modulators.containment * 0.28, 0.24, 0.96)
  const discipline = clamp((finalForm?.shape.edgeContrast ?? 0.62) * 0.62 + (personaDNA.precision === 'precise' ? 0.18 : personaDNA.precision === 'organic' ? -0.06 : 0) + personaDNA.stability * 0.12, 0.22, 0.96)
  const corePresence = clamp((finalForm?.core.internalPresence ?? 0.62) * 0.72 + (finalForm?.core.intensity ?? 0.54) * 0.18 + (personaDNA.presenceStyle === 'dominant' ? 0.08 : personaDNA.presenceStyle === 'reserved' ? -0.04 : 0), 0.24, 0.96)
  const fieldPresence = clamp((finalForm?.field.spread ?? 0.52) * 0.7 + (finalForm?.field.intensity ?? 0.32) * 0.2 + modulators.fieldSpreadBias * 0.22, 0.12, 0.92)
  const occupancy = clamp(fieldPresence + (personaDNA.presenceStyle === 'dominant' ? 0.2 : personaDNA.presenceStyle === 'reserved' ? -0.1 : 0), 0.14, 0.94)
  const stability = clamp((personaDNA.stability * 0.56) + ((finalForm?.shape.deformation ? 1 - finalForm.shape.deformation : 0.86) * 0.28) + containment * 0.16, 0.18, 0.96)
  const rhythm = clamp(personaDNA.temperament === 'intense' ? 0.88 : personaDNA.temperament === 'dynamic' ? 0.96 : personaDNA.temperament === 'ritual' ? 1 : 1.08, 0.82, 1.12)
  const postureLift = clamp(8 - modulators.postureLift + (personaDNA.presenceStyle === 'dominant' ? 3 : personaDNA.presenceStyle === 'reserved' ? -1 : 1), 2, 16)

  const eyebrow =
    personaDNA.presenceStyle === 'dominant'
      ? 'Presença afirmada'
      : personaDNA.presenceStyle === 'reserved'
        ? 'Presença contida'
        : 'Presença estabilizada'

  const title =
    personaDNA.temperament === 'calm'
      ? 'A entidade final respira com estabilidade, núcleo consistente e leitura limpa'
      : personaDNA.temperament === 'intense'
        ? 'A entidade final fecha com energia alta, presença forte e núcleo evidente'
        : personaDNA.temperament === 'ritual'
          ? 'A entidade final fecha com precisão contínua, disciplina e presença composta'
          : 'A entidade final preserva mobilidade, coesão e presença pública convincente'

  const detail =
    personaDNA.presenceStyle === 'reserved'
      ? 'O estado público final mantém margem, contenção e silêncio suficientes para sustentar valor sem excesso visual.'
      : personaDNA.presenceStyle === 'dominant'
        ? 'O estado público final ocupa espaço com clareza. Núcleo, campo e corpo fecham a presença como consequência natural do ritual.'
        : 'O estado público final equilibra corpo, campo e núcleo para que a presença pareça madura, não apenas concluída.'

  const impactCopy =
    mode === 'robo-ia'
      ? 'A leitura final prioriza disciplina estrutural, núcleo legível e uma presença pronta para circular sem ruído.'
      : mode === 'natureza'
        ? 'A leitura final prioriza continuidade orgânica, núcleo estável e uma presença que permanece viva sem exagero.'
        : mode === 'elemental'
          ? 'A leitura final preserva energia e decisão, mas já em estado público controlado e consistente.'
          : 'A leitura final concentra presença, núcleo e clareza pública em uma forma pronta para circular.'

  return {
    eyebrow,
    title,
    detail,
    impactCopy,
    signals: [
      containment >= 0.72 ? 'contenção alta e bem preservada' : containment <= 0.38 ? 'contenção baixa, presença mais aberta' : 'contenção equilibrada',
      discipline >= 0.74 ? 'disciplina visual alta' : discipline <= 0.42 ? 'disciplina visual mais flexível' : 'disciplina visual estável',
      personaDNA.presenceStyle === 'dominant' && occupancy >= 0.58
        ? 'presença dominante com ocupação clara'
        : occupancy >= 0.72
          ? 'presença dominante com ocupação clara'
          : occupancy <= 0.38
            ? 'presença mais guardada e econômica'
            : 'presença pública equilibrada',
      corePresence >= 0.74 ? 'núcleo forte e legível' : corePresence <= 0.44 ? 'núcleo discreto, porém consistente' : 'núcleo contínuo e estável',
      postureLift >= 10 ? 'postura elevada e afirmativa' : postureLift <= 5 ? 'postura mais baixa e reservada' : 'postura centrada e estável',
    ],
    styleVars: {
      '--persona-lab-final-rhythm': rhythm.toFixed(3),
      '--persona-lab-final-containment': containment.toFixed(3),
      '--persona-lab-final-discipline': discipline.toFixed(3),
      '--persona-lab-final-core-presence': corePresence.toFixed(3),
      '--persona-lab-final-field-presence': fieldPresence.toFixed(3),
      '--persona-lab-final-occupancy': occupancy.toFixed(3),
      '--persona-lab-final-posture-lift': postureLift.toFixed(2),
      '--persona-lab-final-stability': stability.toFixed(3),
    },
  }
}

export function getSocialExportModel(args: {
  mode?: ManifestationMode
  variant?: string
  publicName?: string
  handle?: string
  previewLabel?: string
  previewDescription?: string
  personaDNA?: PersonaDNA
  finalForm?: EntityFinalForm
  format?: 'post' | 'story' | 'link'
}): SocialExportModel {
  const finalPresence = getFinalPresenceModel({
    mode: args.mode,
    personaDNA: args.personaDNA,
    finalForm: args.finalForm,
  })

  const publicName = args.publicName ?? 'Esta entidade'
  const entityType =
    args.personaDNA?.presenceStyle === 'dominant'
      ? 'entidade de presença afirmada'
      : args.personaDNA?.presenceStyle === 'reserved'
        ? 'entidade de presença contida'
        : args.personaDNA?.temperament === 'ritual'
          ? 'entidade de presença disciplinada'
          : 'entidade de presença estabilizada'
  const intensityLabel =
    args.finalForm?.intensity === 'cinematic'
      ? 'intensidade alta e controlada'
      : args.finalForm?.intensity === 'soft'
        ? 'intensidade suave e precisa'
        : args.personaDNA?.temperament === 'intense'
          ? 'intensidade forte'
          : args.personaDNA?.temperament === 'calm'
            ? 'intensidade estável'
            : 'intensidade equilibrada'
  const postureLabel =
    args.personaDNA?.presenceStyle === 'dominant'
      ? 'postura elevada e ocupação clara'
      : args.personaDNA?.presenceStyle === 'reserved'
        ? 'postura contida e leitura guardada'
        : args.personaDNA?.temperament === 'ritual'
          ? 'postura disciplinada e contínua'
          : 'postura centrada e pública'
  const descriptorCore = finalPresence.signals[3]?.replace(/^núcleo /, '') ?? 'núcleo contínuo'
  const descriptorDiscipline = finalPresence.signals[1] ?? 'disciplina visual estável'
  const headline =
    args.personaDNA?.temperament === 'calm'
      ? `${publicName} entra em presença pública com estabilidade clara.`
      : args.personaDNA?.temperament === 'intense'
        ? `${publicName} entra em presença pública com força e decisão.`
        : args.personaDNA?.temperament === 'ritual'
          ? `${publicName} entra em presença pública com precisão contínua.`
          : `${publicName} entra em presença pública com identidade nítida.`
  const description = `${entityType} • ${intensityLabel} • ${postureLabel}.`
  const signatureText = `${descriptorDiscipline}, ${descriptorCore} e ${finalPresence.eyebrow.toLowerCase()}.`
  const formatLabel = args.format === 'story' ? 'story de presença' : args.format === 'link' ? 'presença pública' : 'post de presença'
  const previewTitle = `${publicName} em evento de presença`
  const previewDescription = `${args.handle ?? ''}${args.handle ? ' • ' : ''}${entityType} • ${intensityLabel}`

  return {
    headline,
    description,
    entityType,
    intensityLabel,
    postureLabel,
    signatureText,
    previewTitle,
    previewDescription,
    kicker: `Evento de ${args.format === 'story' ? 'Presença' : 'Presença Pública'}`,
    ctaText: args.format === 'story' ? 'Presença pronta para ocupar tela cheia.' : formatLabel === 'presença pública' ? 'Identidade pronta para circular.' : 'Presença pronta para circular com leitura clara.',
  }
}
