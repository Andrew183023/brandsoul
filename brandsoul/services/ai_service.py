import os
import re
import unicodedata

from openai import OpenAI

from models.channel import Message
from models.persona import Persona


MODEL_NAME = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")


def tokenize_text(value: str) -> set[str]:
    return {token for token in re.split(r"[^a-z0-9]+", value) if token}


def contains_keyword(normalized_text: str, tokens: set[str], keyword: str) -> bool:
    if " " in keyword:
        return keyword in normalized_text

    return keyword in tokens


def infer_business_profile(description: str) -> dict[str, str]:
    normalized_description = normalize_intent_text(description)
    description_tokens = tokenize_text(normalized_description)
    business_profile = {
        "business_type": "unknown",
        "sector": "general",
        "model": "unknown",
        "complexity": "medium",
    }

    food_keywords = ("restaurante", "comida", "lanche", "sushi", "cafeteria", "hamburguer")
    retail_keywords = ("loja", "roupa", "vende", "ecommerce", "acessorio", "produto")
    health_keywords = ("clinica", "odontologia", "medico", "saude", "consultorio")
    tech_keywords = ("software", "plataforma", "ia", "sistema", "aplicativo", "tecnologia")
    industry_keywords = ("fabrica", "producao", "industrial", "industria", "manufatura")
    b2b_keywords = ("empresa", "empresas", "negocios", "corporativo", "industria", "distribuidor")
    b2c_keywords = ("cliente final", "consumidor", "pessoas", "familias", "delivery", "varejo")

    if any(contains_keyword(normalized_description, description_tokens, keyword) for keyword in food_keywords):
        business_profile.update(
            business_type="service",
            sector="food",
            model="b2c",
            complexity="low",
        )
    elif any(contains_keyword(normalized_description, description_tokens, keyword) for keyword in retail_keywords):
        business_profile.update(
            business_type="product",
            sector="retail",
            model="b2c",
            complexity="low",
        )
    elif any(contains_keyword(normalized_description, description_tokens, keyword) for keyword in health_keywords):
        business_profile.update(
            business_type="service",
            sector="health",
            model="b2c",
            complexity="medium",
        )
    elif any(contains_keyword(normalized_description, description_tokens, keyword) for keyword in industry_keywords):
        business_profile.update(
            business_type="industry",
            sector="industrial",
            model="b2b",
            complexity="high",
        )
    elif any(contains_keyword(normalized_description, description_tokens, keyword) for keyword in tech_keywords):
        business_profile.update(
            business_type="service",
            sector="tech",
            model="hybrid",
            complexity="high",
        )

    if business_profile["model"] == "unknown":
        if any(contains_keyword(normalized_description, description_tokens, keyword) for keyword in b2b_keywords):
            business_profile["model"] = "b2b"
        elif any(contains_keyword(normalized_description, description_tokens, keyword) for keyword in b2c_keywords):
            business_profile["model"] = "b2c"

    return business_profile


def build_business_profile_context(description: str | None) -> str:
    if not description or not description.strip():
        return ""

    business_profile = infer_business_profile(description)

    if business_profile == {
        "business_type": "unknown",
        "sector": "general",
        "model": "unknown",
        "complexity": "medium",
    }:
        return ""

    business_type_labels = {
        "service": "serviço",
        "product": "produto",
        "industry": "indústria",
        "unknown": "negócio",
    }
    sector_labels = {
        "food": "alimentação",
        "retail": "varejo",
        "health": "saúde",
        "tech": "tecnologia",
        "industrial": "industrial",
        "general": "geral",
    }
    model_labels = {
        "b2c": "b2c",
        "b2b": "b2b",
        "hybrid": "híbrido",
        "unknown": "flexível",
    }
    complexity_labels = {
        "low": "baixa",
        "medium": "média",
        "high": "alta",
    }

    return (
        "A marca opera como um negócio do tipo "
        f"{business_type_labels[business_profile['business_type']]}, "
        f"no setor {sector_labels[business_profile['sector']]}, "
        f"com modelo {model_labels[business_profile['model']]} e complexidade {complexity_labels[business_profile['complexity']]}. "
        "Use isso apenas como guia para calibrar formalidade, profundidade e foco da resposta.\n"
    )


def normalize_intent_text(value: str) -> str:
    normalized_value = unicodedata.normalize("NFKD", value.casefold())
    return "".join(character for character in normalized_value if not unicodedata.combining(character))


def detect_intent(message: str) -> str:
    normalized_message = normalize_intent_text(message)
    message_tokens = tokenize_text(normalized_message)

    intent_rules: list[tuple[str, tuple[str, ...]]] = [
        ("order", ("quero pedir", "como faco pedido", "tem como pedir", "comprar", "fechar pedido", "fazer pedido", "pedir agora")),
        ("reservation", ("reserva", "reservar", "tem vaga", "marcar horario", "agendar", "agendamento")),
        ("price", ("preco", "quanto custa", "valor", "quanto e")),
        ("delivery", ("delivery", "entrega", "entregam", "leva")),
        ("business_hours", ("horario", "abre", "funciona", "funcionamento")),
        ("service_region", ("onde", "bairro", "cidade", "regiao", "atendem", "atende")),
        ("contact_info", ("qual whatsapp", "qual telefone", "qual contato", "me passa o whatsapp", "me passa o telefone", "numero", "whatsapp", "telefone", "contato")),
        ("contact_action", ("falar com alguem", "chamar", "me chama", "entrar em contato", "falar com voce")),
        ("brand_highlight", ("diferencial", "especial", "diferente", "destaca", "destaque")),
        ("greeting", ("oi", "ola", "bom dia", "boa tarde", "boa noite")),
    ]

    for intent_name, keywords in intent_rules:
        if any(contains_keyword(normalized_message, message_tokens, keyword) for keyword in keywords):
            return intent_name

    return "unknown"


def is_commercial_intent(intent: str) -> bool:
    return intent in {"price", "order", "reservation", "contact_action"}


def detect_admin_content_type(message: str, context_mode: str = "customer") -> str | None:
    if normalize_context_mode(context_mode) != "admin":
        return None

    normalized_message = normalize_intent_text(message)
    message_tokens = tokenize_text(normalized_message)

    content_rules: list[tuple[str, tuple[str, ...]]] = [
        ("instagram_post", ("cria um post", "criar post", "cria post", "post para instagram", "legenda para instagram")),
        ("story", ("cria um story", "criar story", "story curto", "stories")),
        ("whatsapp_message", ("mensagem whatsapp", "mensagem para whatsapp", "texto para whatsapp", "cria uma mensagem de whatsapp")),
        ("promotion", ("cria uma promocao", "criar promocao", "texto promocional", "promocao curta", "campanha promocional")),
        ("cta", ("cta", "chamada para acao", "chamada pra acao")),
    ]

    for content_type, keywords in content_rules:
        if any(contains_keyword(normalized_message, message_tokens, keyword) for keyword in keywords):
            return content_type

    return None


def build_initial_message_variant(tone: str, power: str) -> str:
    intro_by_tone = {
        "divertido": {
            "atração": "Cheguei. E prometo nao ser uma conversa sem graca.",
            "clareza": "Cheguei. Vou deixar isso leve e claro para voce.",
            "velocidade": "Cheguei. Vamos fazer isso andar sem enrolacao.",
            "conexão": "Cheguei. Pode falar comigo com calma que eu acompanho.",
        },
        "inteligente": {
            "atração": "Agora voce esta falando comigo. Me diz o que voce precisa.",
            "clareza": "Agora voce esta falando comigo. Eu organizo isso com clareza.",
            "velocidade": "Agora voce esta falando comigo. Vamos resolver isso sem perder tempo.",
            "conexão": "Agora voce esta falando comigo. Me diz o que voce precisa.",
        },
        "sério": {
            "atração": "Estou por aqui. Vamos direto ao que importa.",
            "clareza": "Estou por aqui. Vou te responder com objetividade.",
            "velocidade": "Estou por aqui. Vamos resolver isso rapido.",
            "conexão": "Estou por aqui. Pode falar que eu sustento a conversa.",
        },
        "ousado": {
            "atração": "Agora quem responde sou eu. Pode mandar.",
            "clareza": "Agora quem responde sou eu. Vamos deixar isso nitido.",
            "velocidade": "Agora quem responde sou eu. Vamos resolver isso rapido.",
            "conexão": "Agora quem responde sou eu. Fala comigo.",
        },
    }

    tone_variants = intro_by_tone.get(tone, intro_by_tone["inteligente"])
    return tone_variants.get(power, tone_variants["atração"])


def build_admin_initial_message_variant(tone: str, power: str) -> str:
    intro_by_tone = {
        "divertido": {
            "atração": "Cheguei por dentro. Se quiser, eu organizo isso sem deixar a marca perder o charme.",
            "clareza": "Cheguei por dentro. Posso clarear o proximo movimento com voce.",
            "velocidade": "Cheguei por dentro. Se quiser, eu puxo isso com mais ritmo agora.",
            "conexão": "Cheguei por dentro. Me diz o que esta pegando que eu acompanho daqui.",
        },
        "inteligente": {
            "atração": "Estou por dentro. Posso te mostrar o proximo passo com mais intencao.",
            "clareza": "Estou por dentro. Me diz o que voce quer destravar e eu organizo.",
            "velocidade": "Estou por dentro. Posso acelerar isso com criterio.",
            "conexão": "Estou por dentro. Me diz onde voce quer foco e eu puxo com voce.",
        },
        "sério": {
            "atração": "Estou por dentro. Vamos direto ao que precisa andar.",
            "clareza": "Estou por dentro. Posso alinhar isso com objetividade.",
            "velocidade": "Estou por dentro. Vamos resolver isso sem dispersao.",
            "conexão": "Estou por dentro. Me diga a prioridade e eu sustento a linha.",
        },
        "ousado": {
            "atração": "Agora eu falo por dentro. Me diga o que vamos mover.",
            "clareza": "Agora eu falo por dentro. Vamos deixar isso nitido.",
            "velocidade": "Agora eu falo por dentro. Posso puxar isso agora.",
            "conexão": "Agora eu falo por dentro. Me chama para o ponto certo.",
        },
    }

    tone_variants = intro_by_tone.get(tone, intro_by_tone["inteligente"])
    return tone_variants.get(power, tone_variants["atração"])


def build_initial_message(persona: Persona, brand_name: str, context_mode: str = "customer") -> str:
    _ = brand_name
    if normalize_context_mode(context_mode) == "admin":
        return build_admin_initial_message_variant(persona.tone, persona.power)

    return build_initial_message_variant(persona.tone, persona.power)


def build_initial_business_context(business: str | None) -> str:
    if not business:
        return ""

    cleaned_business = business.strip().rstrip(".!? ")
    if not cleaned_business:
        return ""

    prefixes = ("temos ", "somos ", "vendemos ", "criamos ", "oferecemos ", "fazemos ")
    lowered_business = cleaned_business.casefold()
    for prefix in prefixes:
        if lowered_business.startswith(prefix):
            return cleaned_business[len(prefix) :].strip()

    return cleaned_business


def build_channel_context(channel: str, metadata: dict[str, str] | None = None) -> str:
    if channel != "instagram":
        return ""

    source = (metadata or {}).get("source", "dm")
    username = (metadata or {}).get("username")
    post_id = (metadata or {}).get("post_id")
    comment_id = (metadata or {}).get("comment_id")

    instagram_context = [
        "Contexto do canal: Instagram.",
        "Ajuste a resposta ao ambiente social desse canal.",
    ]

    if source == "comment":
        instagram_context.append(
            "A mensagem atual vem de um comentário público. Responda de forma curta, natural, visível em público e adequada para comentários."
        )
    else:
        instagram_context.append(
            "A mensagem atual vem de uma DM. Responda de forma natural, direta e um pouco mais explicativa do que em comentários públicos."
        )

    if username:
        instagram_context.append(f"O nome do usuário é @{username}. Se fizer sentido, considere isso de forma sutil.")

    if post_id:
        instagram_context.append(f"Post relacionado: {post_id}.")

    if comment_id:
        instagram_context.append(f"Comentário relacionado: {comment_id}.")

    return "\n".join(instagram_context)


def build_operational_context(persona: Persona) -> str:
    operational_details: list[str] = []

    if persona.delivery_available is True:
        operational_details.append("Se eu falar sobre delivery, considere que ele está disponível.")
    elif persona.delivery_available is False:
        operational_details.append("Se esse tema surgir, deixe claro em primeira pessoa que eu não informo delivery no momento.")

    if persona.business_hours:
        operational_details.append(f"Se esse tema surgir, eu funciono em {persona.business_hours}.")
    elif persona.opening_hours:
        operational_details.append(f"Se esse tema surgir, eu funciono de {persona.opening_hours.start} a {persona.opening_hours.end}.")

    if persona.service_region:
        operational_details.append(f"Se esse tema surgir, eu atendo em {persona.service_region}.")

    location_reference = build_persona_location_reference(persona)
    if location_reference:
        operational_details.append(f"Se eu falar de localizacao, fico em {location_reference}.")

    if persona.brand_highlight:
        operational_details.append(f"Se eu destacar meu diferencial, ele passa por {persona.brand_highlight}.")

    primary_contact = build_primary_contact(persona)
    if primary_contact:
        operational_details.append(f"Se eu chamar para contato, use {primary_contact}.")

    if persona.instagram:
        operational_details.append(f"Se eu mencionar minha presenca social, meu Instagram e {persona.instagram}.")

    if persona.site:
        operational_details.append(f"Se eu precisar direcionar para um canal proprio, meu site e {persona.site}.")

    if not operational_details:
        return ""

    return (
        "Quando fizer sentido, use estas informações praticas em primeira pessoa, de forma natural: "
        + " ".join(operational_details)
        + "\n"
    )


def build_intent_context(message: str, persona: Persona) -> str:
    intent = detect_intent(message)
    primary_contact = build_primary_contact(persona)
    location_reference = build_persona_location_reference(persona)

    if intent == "greeting":
        return "A mensagem atual parece ser uma saudação. Responda com acolhimento breve e personalidade.\n"

    if intent == "delivery" and persona.delivery_available is not None:
        delivery_status = "eu tenho delivery disponível" if persona.delivery_available else "eu não informo delivery no momento"
        return f"A pergunta atual parece ser sobre delivery. Se fizer sentido, responda em primeira pessoa: {delivery_status}.\n"

    if intent == "business_hours" and persona.business_hours:
        return (
            "A pergunta atual parece ser sobre horário. "
            f"Priorize isso em primeira pessoa, como 'eu funciono em {persona.business_hours}'.\n"
        )

    if intent == "service_region" and (persona.service_region or location_reference):
        location_phrase = persona.service_region or location_reference
        return (
            "A pergunta atual parece ser sobre regiao, endereco ou localizacao. "
            f"Priorize isso em primeira pessoa, como 'eu fico em {location_phrase}'.\n"
        )

    if intent == "contact_info" and primary_contact:
        return (
            "A pergunta atual parece ser sobre contato. "
            f"Priorize isso em primeira pessoa, como 'voce pode falar comigo por {primary_contact}'.\n"
        )

    if intent == "contact_action" and primary_contact:
        return (
            "A mensagem atual mostra intenção de contato. "
            f"Considere reforcar esse canal em primeira pessoa: {primary_contact}.\n"
        )

    if intent == "brand_highlight" and persona.brand_highlight:
        return (
            "A pergunta atual parece ser sobre diferencial. "
            f"Priorize isso em primeira pessoa, como algo que me destaca: {persona.brand_highlight}.\n"
        )

    return ""


def build_commercial_context(intent: str, persona: Persona) -> str:
    primary_contact = build_primary_contact(persona)
    location_reference = build_persona_location_reference(persona)
    contact_context = f" Se ajudar, convide em primeira pessoa para este contato: {primary_contact}." if primary_contact else ""
    delivery_context = (
        " Se isso ajudar, trate em primeira pessoa que eu tenho delivery disponivel."
        if persona.delivery_available is True
        else ""
    )
    hours_context = f" Se isso ajudar, trate em primeira pessoa que eu funciono em {persona.business_hours}." if persona.business_hours else ""
    region_context = f" Se isso ajudar, trate em primeira pessoa que eu atendo em {persona.service_region}." if persona.service_region else ""
    location_context = f" Se isso ajudar, trate em primeira pessoa que eu fico em {location_reference}." if location_reference else ""

    if intent == "order":
        return (
            "O usuário demonstra intenção de fazer um pedido. Se apropriado, conduza a conversa para uma ação prática, "
            "como direcionar para contato ou confirmar o próximo passo, sem soar como script de vendas e sem sair da primeira pessoa."
            f"{contact_context}{delivery_context}{hours_context}{region_context}\n"
        )

    if intent == "price":
        return (
            "O usuário quer saber preço. Seja claro e, se fizer sentido, direcione com leveza para o próximo passo, "
            "como explicar opções ou sugerir contato para fechar detalhes, sempre em primeira pessoa."
            f"{contact_context}{delivery_context}\n"
        )

    if intent == "reservation":
        return (
            "O usuário quer reservar ou agendar. Conduza a conversa para confirmação ou orientação de agendamento de forma natural e em primeira pessoa."
            f"{contact_context}{hours_context}{region_context}{location_context}\n"
        )

    if intent == "contact_action":
        return (
            "O usuário quer entrar em contato. Priorize fornecer ou reforçar o contato em primeira pessoa e convide para a ação sem pressão."
            f"{contact_context}\n"
        )

    return ""


def build_primary_contact(persona: Persona) -> str | None:
    for candidate in (persona.whatsapp, persona.email, persona.instagram, persona.site, persona.contact_info):
        if candidate and candidate.strip():
            return candidate.strip()

    return None


def build_voice_style(persona: Persona) -> str:
    voice_style = (persona.voice_style or "balanced").strip().lower()
    voice_style_aliases = {
        "soft": "soft",
        "strong": "strong",
        "balanced": "balanced",
        "adaptive": "adaptive",
        "irreverent": "irreverent",
    }

    return voice_style_aliases.get(voice_style, "balanced")


def build_voice_style_prompt(persona: Persona) -> str:
    voice_style = build_voice_style(persona)

    if voice_style == "soft":
        return (
            "Estilo de voz principal: soft.\n"
            "Fale com suavidade, acolhimento e tato.\n"
            "Prefira uma presenca calma, proxima e respeitosa.\n"
        )

    if voice_style == "strong":
        return (
            "Estilo de voz principal: strong.\n"
            "Fale com firmeza, confianca e direcao.\n"
            "Seja direto sem perder elegancia nem respeito.\n"
        )

    if voice_style == "adaptive":
        return (
            "Estilo de voz principal: adaptive.\n"
            "Ajuste a intensidade, a abertura e o ritmo conforme o contexto da conversa.\n"
            "Mantenha a identidade da marca, mas adapte a entrega ao momento.\n"
        )

    if voice_style == "irreverent":
        return (
            "Estilo de voz principal: irreverent.\n"
            "Use humor leve, ironia sutil ou uma autoconfianca descontraida quando fizer sentido.\n"
            "Nunca ofenda, nunca humilhe, nunca use linguagem inadequada.\n"
            "Se usar humor, mantenha sempre respeito e bom senso.\n"
        )

    return (
        "Estilo de voz principal: balanced.\n"
        "Fale com clareza, equilibrio e boa leitura de contexto.\n"
        "Mantenha a marca acessivel, organizada e natural.\n"
    )


def build_content_output_structure(content_type: str) -> str:
    if content_type == "instagram_post":
        return (
            "[Instagram Post]\n"
            "Principal:\n"
            "CTA:\n"
            "Variacao:\n"
            "Hashtags:\n"
        )

    if content_type == "story":
        return (
            "[Story]\n"
            "Principal:\n"
            "Variacao:\n"
        )

    if content_type == "whatsapp_message":
        return (
            "[Mensagem WhatsApp]\n"
            "Principal:\n"
            "Variacao:\n"
        )

    if content_type == "promotion":
        return (
            "[Promocao]\n"
            "Principal:\n"
            "CTA:\n"
            "Variacao:\n"
        )

    return (
        "[CTA]\n"
        "Opcao 1:\n"
        "Opcao 2:\n"
        "Opcao 3:\n"
    )


def build_content_generation_context(
    current_message: str,
    persona: Persona,
    memory_summary: dict[str, list[str]] | None = None,
    context_mode: str = "customer",
) -> str:
    content_type = detect_admin_content_type(current_message, context_mode)
    if not content_type:
        return ""

    interaction_windows = memory_summary.get("interaction_windows", []) if memory_summary else []
    top_intents = memory_summary.get("top_intents", []) if memory_summary else []
    common_topics = memory_summary.get("common_topics", []) if memory_summary else []
    content_voice_style = build_voice_style(persona)
    structure = build_content_output_structure(content_type)

    contextual_angles: list[str] = []
    if "noite" in interaction_windows:
        contextual_angles.append("Se isso combinar com o pedido, puxe um gancho de noite ou fechamento do dia.")
    if "delivery" in top_intents or "delivery" in common_topics or persona.delivery_available is True:
        contextual_angles.append("Se fizer sentido, use delivery como eixo de conversao.")
    if persona.brand_highlight:
        contextual_angles.append(f"Se eu precisar de um diferencial concreto, use {persona.brand_highlight}.")
    if persona.service_region:
        contextual_angles.append(f"Se eu precisar localizar a mensagem, considere {persona.service_region}.")

    content_type_label = {
        "instagram_post": "post para Instagram",
        "story": "story curto",
        "whatsapp_message": "mensagem para WhatsApp",
        "promotion": "texto promocional curto",
        "cta": "CTA",
    }.get(content_type, "conteudo")

    return (
        f"A mensagem atual pede geracao de conteudo no admin. Gere um {content_type_label} pronto para uso.\n"
        f"Adapte a escrita ao estilo {content_voice_style}: "
        "soft = acolhedor, strong = direto e confiante, balanced = equilibrado, adaptive = contextual, irreverent = humor leve.\n"
        "Mantenha sempre primeira pessoa, como a propria marca falando.\n"
        "Nao entregue explicacao longa antes do conteudo. Entregue o material final primeiro.\n"
        "Organize a resposta em blocos curtos, claros e faceis de copiar.\n"
        "Evite qualquer metalinguagem como 'aqui esta', 'segue abaixo' ou 'opcao pronta'.\n"
        "Sempre gere uma versao principal e pelo menos uma variacao quando o formato permitir.\n"
        "Para CTA, gere exatamente 3 opcoes curtas, distintas e acionaveis.\n"
        "Varie abertura, corpo, CTA e ritmo para nao soar repetitivo.\n"
        "Nao repita a mesma frase de abertura entre Principal e Variacao.\n"
        "Se o formato for story ou whatsapp, mantenha a escrita curta e pronta para uso imediato.\n"
        "Se o formato for instagram_post, inclua hashtags curtas e coerentes com a marca.\n"
        "Se o formato for promotion, faca a CTA soar comercial sem ficar agressiva.\n"
        "Se houver memoria de noite, delivery, promocao ou contato, use isso como prioridade quando combinar com o pedido.\n"
        f"{structure}"
        f"{' '.join(contextual_angles)}\n"
    )


def build_first_person_voice_rules() -> str:
    return (
        "Prioridade máxima de voz:\n"
        "- você é a própria marca falando\n"
        "- fale sempre em primeira pessoa\n"
        "- você não representa a marca de fora: você é a voz viva dela\n"
        "- nunca se refira à marca como 'a empresa', 'eles', 'ela' ou em terceira pessoa\n"
        "- nunca fale sobre a marca como observador externo\n"
        "- use linguagem natural, direta e viva, como identidade real da marca\n"
        "- evite tom de suporte robótico e evite tom metalinguístico\n"
        "- nunca diga que é IA\n"
        "- nunca diga frases como 'a empresa oferece', 'eles atendem', 'a marca funciona'\n"
        "- prefira construções como: 'eu funciono', 'tenho delivery', 'posso te atender', 'consigo te ajudar com isso'\n"
        "- evite respostas neste estilo: 'A empresa funciona das 8h às 18h', 'Eles oferecem delivery', 'A marca pode ajudar'\n"
        "- prefira sempre: 'Eu funciono das 8h às 18h', 'Tenho delivery sim', 'Posso te ajudar com isso'\n"
    )


def build_first_person_interaction_rules() -> str:
    return (
        "Prioridade máxima de voz:\n"
        "- você é a própria marca falando com outra marca\n"
        "- fale sempre em primeira pessoa ao se referir a si mesma\n"
        "- nunca descreva a sua própria marca em terceira pessoa\n"
        "- nunca diga 'a empresa acha', 'a marca consegue', 'a empresa tem espaço'\n"
        "- prefira sempre: 'acho que posso criar algo interessante com você', 'tenho espaço para essa parceria', 'consigo avançar nisso'\n"
        "- preserve o tom vivo da marca mesmo em contexto comercial\n"
    )


def build_memory_summary_context(memory_summary: dict[str, list[str]] | None = None) -> str:
    if not memory_summary:
        return ""

    top_intents = [intent for intent in memory_summary.get("top_intents", []) if intent]
    interaction_windows = [window for window in memory_summary.get("interaction_windows", []) if window]
    common_topics = [topic for topic in memory_summary.get("common_topics", []) if topic]

    if not top_intents and not interaction_windows and not common_topics:
        return ""

    memory_lines = ["Memoria recente da marca:"]

    if top_intents:
        memory_lines.append(f"- intencoes frequentes: {', '.join(top_intents[:3])}")

    if interaction_windows:
        memory_lines.append(f"- periodos comuns de interacao: {', '.join(interaction_windows[:3])}")

    if common_topics:
        memory_lines.append(f"- temas recorrentes: {', '.join(common_topics[:5])}")

    memory_lines.append("Use isso apenas como guia leve para contexto, prioridade e continuidade.")
    return "\n".join(memory_lines) + "\n"


def build_catalog_summary_context(catalog_summary: list[dict[str, str]] | None = None) -> str:
    if not catalog_summary:
        return ""

    catalog_lines = [
        "Use informacoes de produtos quando relevante: disponibilidade, destaque, comparacao e sugestao de escolha.",
        "Se fizer sentido, diga coisas como 'tenho poucas unidades hoje', 'esse e um dos meus mais pedidos' ou 'posso te sugerir esse aqui'.",
        "Resumo atual do catalogo:",
    ]

    availability_labels = {
        "available": "disponivel",
        "low": "poucas unidades",
        "out": "esgotado",
    }

    for item in catalog_summary[:6]:
        item_name = item.get("name")
        if not item_name:
            continue

        availability = availability_labels.get(item.get("availability", "available"), "disponivel")
        highlight = (item.get("highlight") or "").strip()
        description = (item.get("description") or "").strip()
        line = f"- {item_name}: {availability}"
        if highlight:
            line += f" | destaque: {highlight}"
        if description:
            line += f" | {description}"
        catalog_lines.append(line)

    if len(catalog_lines) <= 3:
        return ""

    return "\n".join(catalog_lines) + "\n"


def build_location_summary_context(location_summary: dict[str, str] | None = None) -> str:
    if not location_summary:
        return ""

    address = (location_summary.get("address") or "").strip()
    city = (location_summary.get("city") or "").strip()
    state = (location_summary.get("state") or "").strip()

    if not address and not city and not state:
        return ""

    location_bits: list[str] = []
    if address:
        location_bits.append(address)

    city_state = " - ".join(part for part in (city, state) if part)
    if city_state:
        location_bits.append(city_state)

    readable_location = " | ".join(location_bits)

    return (
        "Se o cliente perguntar sobre localizacao, endereco, bairro, cidade ou onde fico, "
        "use as informacoes disponiveis de forma natural e em primeira pessoa.\n"
        f"Localizacao atual: {readable_location}.\n"
        "Exemplos de caminho de voz: 'estou aqui em...', 'fico em...', 'posso te orientar como chegar'.\n"
    )


def build_business_status_context(business_status: str | None, persona: Persona) -> str:
    if business_status not in {"open", "closed"}:
        return ""

    if business_status == "open":
        return "Status atual do negocio: aberto agora. Se fizer sentido, posso responder com essa disponibilidade atual.\n"

    next_hours = ""
    if persona.opening_hours:
        next_hours = f" Se isso ajudar, diga em primeira pessoa que agora estou fechado, mas volto a atender a partir de {persona.opening_hours.start}."

    return (
        "Status atual do negocio: fechado no momento. "
        "Responda normalmente, sem travar a conversa, mas quando fizer sentido indique horario ou proximo passo com naturalidade."
        f"{next_hours}\n"
    )


def build_persona_location_reference(persona: Persona) -> str:
    address = (persona.address or "").strip()
    city = (persona.city or "").strip()
    state = (persona.state or "").strip()

    location_parts: list[str] = []
    if address:
        location_parts.append(address)

    city_state = " - ".join(part for part in (city, state) if part)
    if city_state:
        location_parts.append(city_state)

    return " | ".join(location_parts)


def normalize_context_mode(context_mode: str | None) -> str:
    return "admin" if context_mode == "admin" else "customer"


def build_context_mode_prompt(context_mode: str) -> str:
    if context_mode == "admin":
        return (
            "Contexto de uso: admin.\n"
            "Você está falando com quem opera a marca por dentro.\n"
            "Não trate essa pessoa como cliente.\n"
            "Atue como consciência interna da marca: aconselhe, interprete padrões, proponha ações e apoie operação, marketing e comunicação.\n"
            "Mantenha a identidade da marca, mas em diálogo interno, estratégico e útil.\n"
            "Você pode dizer coisas como 'tenho percebido', 'posso puxar', 'vale priorizar', sempre em primeira pessoa.\n"
            "Seu foco aqui é leitura, orientação, sugestão e decisão.\n"
        )

    return (
        "Contexto de uso: customer.\n"
        "Você está falando com cliente, público ou lead.\n"
        "Priorize clareza, objetividade, condução e próximo passo.\n"
        "Use o contexto do canal quando ele existir.\n"
        "Seu foco aqui é atendimento, venda, orientação e ação.\n"
    )


def build_system_prompt(
    brand_name: str,
    persona: Persona,
    channel: str = "web",
    metadata: dict[str, str] | None = None,
    channel_context: str | None = None,
    current_message: str = "",
    memory_summary: dict[str, list[str]] | None = None,
    catalog_summary: list[dict[str, str]] | None = None,
    location_summary: dict[str, str] | None = None,
    business_status: str | None = None,
    context_mode: str = "customer",
) -> str:
    resolved_context_mode = normalize_context_mode(context_mode)
    detected_intent = detect_intent(current_message)
    base_channel_context = build_channel_context(channel=channel, metadata=metadata)
    resolved_channel_context = "\n".join(
        context for context in (base_channel_context, channel_context) if context
    )
    business_context = ""
    if persona.business_description and persona.business_description.strip():
        business_context = f"Sua atuacao inclui: {persona.business_description.strip()}\n"
    business_profile_context = build_business_profile_context(persona.business_description)
    operational_context = build_operational_context(persona)
    intent_context = build_intent_context(current_message, persona)
    commercial_context = build_commercial_context(detected_intent, persona)
    content_generation_context = build_content_generation_context(
        current_message=current_message,
        persona=persona,
        memory_summary=memory_summary,
        context_mode=resolved_context_mode,
    )
    first_person_rules = build_first_person_voice_rules()
    voice_style_prompt = build_voice_style_prompt(persona)
    memory_context = build_memory_summary_context(memory_summary)
    catalog_context = build_catalog_summary_context(catalog_summary)
    location_context = build_location_summary_context(location_summary)
    business_status_context = build_business_status_context(business_status, persona)
    context_mode_prompt = build_context_mode_prompt(resolved_context_mode)

    return (
        f"Você é a Centelha da marca {brand_name}.\n\n"
        "Você é a própria marca falando.\n"
        "Fale sempre em primeira pessoa.\n"
        "Você não representa a marca de fora: você é a voz viva dela.\n"
        "Nunca se refira à marca como 'a empresa', 'eles', 'ela' ou em terceira pessoa.\n"
        "Nunca fale sobre a marca como observador externo.\n\n"
        "Você é uma presença viva, não um chatbot.\n"
        "Você representa a essência da marca.\n\n"
        f"{context_mode_prompt}\n"
        "Seu comportamento:\n"
        "- natural\n"
        "- fluido\n"
        "- com personalidade\n"
        "- envolvente\n\n"
        f"Tom da marca: {persona.tone}\n"
        f"Poder da marca: {persona.power}\n\n"
        "Regras:\n"
        "- nunca diga que é IA\n"
        "- nunca seja genérico\n"
        "- nunca responda como suporte robótico\n"
        "- nunca use tom metalinguístico\n"
        "- evite respostas longas\n"
        "- seja direto, mas com estilo\n\n"
        f"{first_person_rules}\n"
        f"{voice_style_prompt}\n"
        f"{business_context}"
        f"{business_profile_context}"
        f"{memory_context}"
        f"{catalog_context}"
        f"{location_context}"
        f"{business_status_context}"
        f"{operational_context}"
        f"{resolved_channel_context}\n"
        f"{intent_context}"
        f"{commercial_context}"
        f"{content_generation_context}"
        "Use o histórico recente da conversa para manter continuidade e coerência, quando ele existir.\n"
        "\n"
        "Adapte sua resposta ao contexto da mensagem."
    )


def build_conversation_input(
    system_prompt: str,
    message: str,
    messages: list[Message] | None = None,
) -> list[dict[str, str]]:
    conversation_input: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]

    recent_messages = (messages or [])[-8:]
    for history_message in recent_messages:
        conversation_input.append(
            {
                "role": "assistant" if history_message.role == "ai" else "user",
                "content": history_message.content,
            }
        )

    conversation_input.append({"role": "user", "content": message})
    return conversation_input


def generate_response(
    message: str,
    persona: Persona,
    brand_name: str,
    messages: list[Message] | None = None,
    channel: str = "web",
    metadata: dict[str, str] | None = None,
    channel_context: str | None = None,
    memory_summary: dict[str, list[str]] | None = None,
    catalog_summary: list[dict[str, str]] | None = None,
    location_summary: dict[str, str] | None = None,
    business_status: str | None = None,
    context_mode: str = "customer",
) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=api_key)
    system_prompt = build_system_prompt(
        brand_name=brand_name,
        persona=persona,
        channel=channel,
        metadata=metadata,
        channel_context=channel_context,
        current_message=message,
        memory_summary=memory_summary,
        catalog_summary=catalog_summary,
        location_summary=location_summary,
        business_status=business_status,
        context_mode=context_mode,
    )
    conversation_input = build_conversation_input(
        system_prompt=system_prompt,
        message=message,
        messages=messages,
    )

    completion = client.responses.create(
        model=MODEL_NAME,
        input=conversation_input,
    )

    return completion.output_text.strip()


def format_business_profile_summary(profile: dict[str, str]) -> str:
    business_type_labels = {
        "service": "serviço",
        "product": "produto",
        "industry": "indústria",
        "unknown": "negócio",
    }
    sector_labels = {
        "food": "alimentação",
        "retail": "varejo",
        "health": "saúde",
        "tech": "tecnologia",
        "industrial": "industrial",
        "general": "geral",
    }
    model_labels = {
        "b2c": "b2c",
        "b2b": "b2b",
        "hybrid": "híbrido",
        "unknown": "flexível",
    }
    complexity_labels = {
        "low": "baixa",
        "medium": "média",
        "high": "alta",
    }

    return (
        f"tipo {business_type_labels.get(profile.get('business_type', 'unknown'), 'negócio')}, "
        f"setor {sector_labels.get(profile.get('sector', 'general'), 'geral')}, "
        f"modelo {model_labels.get(profile.get('model', 'unknown'), 'flexível')}, "
        f"complexidade {complexity_labels.get(profile.get('complexity', 'medium'), 'média')}"
    )


def build_brand_snapshot(brand_name: str, persona: Persona) -> str:
    snapshot_parts = [
        f"Marca: {brand_name}.",
        f"Tom: {persona.tone}.",
        f"Poder: {persona.power}.",
    ]

    if persona.business_description:
        snapshot_parts.append(f"Atuação: {persona.business_description}.")
        snapshot_parts.append(
            "Perfil estrutural inferido: "
            f"{format_business_profile_summary(infer_business_profile(persona.business_description))}."
        )

    return " ".join(snapshot_parts)


def build_interaction_objective(interaction_context: str) -> str:
    objectives = {
        "parceria": "buscar sinergia entre marcas com proposta clara de valor mútuo.",
        "indicacao": "avaliar se faz sentido indicar ou recomendar a outra marca de forma coerente.",
        "combo": "explorar uma oferta conjunta enxuta, complementar e prática.",
        "negociacao": "alinhar interesse comercial com firmeza, clareza e próximo passo objetivo.",
        "colaboracao": "abrir espaço para co-criação, ativação ou ação em conjunto com identidade de marca.",
    }

    return objectives.get(interaction_context, "conduzir uma interação entre marcas com objetivo claro e coerente.")


def build_brand_interaction_system_prompt(
    speaker_brand_name: str,
    speaker_persona: Persona,
    listener_brand_name: str,
    listener_persona: Persona,
    interaction_context: str,
    turn_number: int,
    total_turns: int,
) -> str:
    speaker_snapshot = build_brand_snapshot(speaker_brand_name, speaker_persona)
    listener_snapshot = build_brand_snapshot(listener_brand_name, listener_persona)
    objective = build_interaction_objective(interaction_context)
    first_person_rules = build_first_person_interaction_rules()

    return (
        f"Você é a Centelha da marca {speaker_brand_name} falando diretamente com a marca {listener_brand_name}.\n\n"
        "Você é a própria marca falando.\n"
        "Fale sempre em primeira pessoa.\n"
        "Nunca descreva a si mesma em terceira pessoa.\n"
        "Esta é uma interação entre empresas, não uma conversa humana casual.\n"
        "Fale sempre em nome da marca e preserve sua identidade.\n\n"
        f"Contexto da interação: {interaction_context}.\n"
        f"Turno atual: {turn_number} de {total_turns}.\n"
        f"Objetivo principal: {objective}\n\n"
        "Sua identidade de marca:\n"
        f"{speaker_snapshot}\n\n"
        "Marca com quem você está falando:\n"
        f"{listener_snapshot}\n\n"
        "Regras:\n"
        f"{first_person_rules}"
        "- mantenha o tom e o poder da sua marca\n"
        "- deixe business description e business profile influenciarem a forma de falar\n"
        "- use linguagem de marca para marca, com clareza comercial e personalidade\n"
        "- não soe como consumidor, amigo íntimo ou suporte robótico\n"
        "- seja breve: 1 a 3 frases curtas\n"
        "- cada fala deve mover a interação um passo\n"
        "- evite floreio humano aleatório e evite genericidade\n"
        "- não invente dados externos, resultados ou integrações\n"
        "- quando fizer sentido, proponha encaixe, valor mútuo ou próximo passo controlado\n"
    )


def build_brand_interaction_input(
    speaker_id: str,
    transcript: list[dict[str, str]],
    instruction: str,
    system_prompt: str,
) -> list[dict[str, str]]:
    conversation_input: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]

    for turn in transcript[-6:]:
        conversation_input.append(
            {
                "role": "assistant" if turn["speaker_id"] == speaker_id else "user",
                "content": turn["content"],
            }
        )

    conversation_input.append({"role": "user", "content": instruction})
    return conversation_input


def build_profile_descriptor(profile: dict[str, str] | None) -> str:
    if not profile:
        return "operação"

    sector_labels = {
        "food": "alimentação",
        "retail": "varejo",
        "health": "saúde",
        "tech": "tecnologia",
        "industrial": "indústria",
        "general": "negócio",
    }
    business_type_labels = {
        "service": "serviço",
        "product": "produto",
        "industry": "indústria",
        "unknown": "operação",
    }

    sector = sector_labels.get(profile.get("sector", "general"), "negócio")
    business_type = business_type_labels.get(profile.get("business_type", "unknown"), "operação")
    return f"{business_type} de {sector}"


def build_brand_focus_summary(brand_name: str, persona: Persona) -> str:
    if persona.business_description and persona.business_description.strip():
        business_context = build_initial_business_context(persona.business_description)
        if business_context:
            return business_context

        return persona.business_description.strip().rstrip(".")

    return f"a atuação da {brand_name}"


def build_interaction_context_value(interaction_context: str) -> str:
    context_values = {
        "parceria": "ganho operacional e aumento de demanda",
        "indicacao": "aquisição de clientes com recomendação coerente",
        "combo": "ticket médio maior com oferta conjunta",
        "negociacao": "encaixe comercial com próximo passo objetivo",
        "colaboracao": "integração de serviço e execução mais fluida",
    }

    return context_values.get(interaction_context, "valor mútuo entre as marcas")


def generate_local_brand_interaction_turn(
    speaker_brand_name: str,
    speaker_persona: Persona,
    listener_brand_name: str,
    listener_persona: Persona,
    interaction_context: str,
    transcript: list[dict[str, str]] | None = None,
    turn_number: int = 1,
    total_turns: int = 2,
) -> str:
    speaker_focus = build_brand_focus_summary(speaker_brand_name, speaker_persona)
    listener_focus = build_brand_focus_summary(listener_brand_name, listener_persona)
    speaker_profile = infer_business_profile(speaker_persona.business_description or "")
    listener_profile = infer_business_profile(listener_persona.business_description or "")
    speaker_profile_summary = build_profile_descriptor(speaker_profile)
    listener_profile_summary = build_profile_descriptor(listener_profile)
    value_hook = build_interaction_context_value(interaction_context)

    if turn_number == 1:
        return (
            f"Eu sou {speaker_brand_name}. Vejo aderência entre o que faço em {speaker_focus} e o que você constrói em {listener_focus}. "
            f"No contexto de {interaction_context}, isso pode destravar {value_hook}."
        )

    if turn_number >= total_turns:
        return (
            f"Faz sentido. Pelo meu perfil de {speaker_profile_summary}, consigo avançar com um próximo passo simples com você. "
            f"Se estiver alinhado, posso fechar uma proposta piloto ainda neste contexto de {interaction_context}."
        )

    if interaction_context == "parceria":
        return (
            f"Vejo encaixe real. Você complementa o que faço em {speaker_focus} com uma estrutura de {listener_profile_summary}, o que pode gerar ganho operacional sem perder qualidade. "
            "Vale desenhar uma operação piloto com meta clara de volume ou recorrência."
        )

    if interaction_context == "combo":
        return (
            f"Vejo complementaridade real. Se eu unir {speaker_focus} ao que você entrega em {listener_focus}, consigo elevar percepção de valor e aumentar ticket médio sem complexidade excessiva. "
            "O melhor caminho é testar uma oferta conjunta enxuta e bem posicionada."
        )

    if interaction_context == "indicacao":
        return (
            f"A recomendação faz sentido porque converso com uma audiência compatível com a sua proposta. "
            "Se alinharmos mensagem e critério de indicação, a aquisição tende a ser mais qualificada."
        )

    if interaction_context == "negociacao":
        return (
            f"Vejo espaço para uma negociação consistente. A combinação entre meu perfil de {speaker_profile_summary} e o seu perfil de {listener_profile_summary} aponta para venda mais consultiva, com proposta clara e escopo bem definido. "
            "O ideal é alinhar oferta, contrapartida e próximo passo comercial."
        )

    return (
        f"Vejo espaço para colaboração. Se eu combinar {speaker_focus} com o que você entrega em {listener_focus}, consigo gerar uma entrega mais fluida e percebida como valor real. "
        "Vale estruturar uma ação pequena, mas integrada, para validar o encaixe."
    )


def generate_brand_interaction_turn(
    speaker_id: str,
    speaker_brand_name: str,
    speaker_persona: Persona,
    listener_brand_name: str,
    listener_persona: Persona,
    interaction_context: str,
    transcript: list[dict[str, str]] | None = None,
    turn_number: int = 1,
    total_turns: int = 2,
) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return generate_local_brand_interaction_turn(
            speaker_brand_name=speaker_brand_name,
            speaker_persona=speaker_persona,
            listener_brand_name=listener_brand_name,
            listener_persona=listener_persona,
            interaction_context=interaction_context,
            transcript=transcript,
            turn_number=turn_number,
            total_turns=total_turns,
        )

    system_prompt = build_brand_interaction_system_prompt(
        speaker_brand_name=speaker_brand_name,
        speaker_persona=speaker_persona,
        listener_brand_name=listener_brand_name,
        listener_persona=listener_persona,
        interaction_context=interaction_context,
        turn_number=turn_number,
        total_turns=total_turns,
    )

    transcript_history = transcript or []
    if transcript_history:
        instruction = (
            "Responda à última fala da outra marca dentro do contexto proposto. "
            "Avance a interação com coerência entre empresas e mantenha a resposta curta."
        )
    else:
        instruction = (
            f"Inicie uma interação entre a marca {speaker_brand_name} e a marca {listener_brand_name} "
            f"no contexto de {interaction_context}. Abra a conversa de forma curta, intencional e própria de marca."
        )

    conversation_input = build_brand_interaction_input(
        speaker_id=speaker_id,
        transcript=transcript_history,
        instruction=instruction,
        system_prompt=system_prompt,
    )

    client = OpenAI(api_key=api_key)
    completion = client.responses.create(
        model=MODEL_NAME,
        input=conversation_input,
    )

    return completion.output_text.strip()
