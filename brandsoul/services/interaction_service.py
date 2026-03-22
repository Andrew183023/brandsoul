from models.interaction import InteractionRequest, InteractionResponse, InteractionTurn
from services.ai_service import generate_brand_interaction_turn, infer_business_profile


def build_participant_profile(description: str | None) -> dict[str, str] | None:
    if not description or not description.strip():
        return None

    return infer_business_profile(description)


def simulate_interaction(payload: InteractionRequest) -> InteractionResponse:
    transcript: list[InteractionTurn] = []

    for turn_index in range(payload.turns):
        is_initiator_turn = turn_index % 2 == 0
        speaker_id = "a" if is_initiator_turn else "b"
        speaker = payload.initiator if is_initiator_turn else payload.receiver
        listener = payload.receiver if is_initiator_turn else payload.initiator

        response = generate_brand_interaction_turn(
            speaker_id=speaker_id,
            speaker_brand_name=speaker.brand_name,
            speaker_persona=speaker.persona,
            listener_brand_name=listener.brand_name,
            listener_persona=listener.persona,
            interaction_context=payload.context,
            transcript=[
                {"speaker_id": turn.speaker_id, "content": turn.content}
                for turn in transcript
            ],
            turn_number=turn_index + 1,
            total_turns=payload.turns,
        )

        transcript.append(
            InteractionTurn(
                speaker_id=speaker_id,
                brand_name=speaker.brand_name,
                content=response,
                tone=speaker.persona.tone,
                power=speaker.persona.power,
                business_profile=build_participant_profile(speaker.persona.business_description),
            )
        )

    return InteractionResponse(
        context=payload.context,
        turns=payload.turns,
        transcript=transcript,
        metadata={
            "initiator_profile": build_participant_profile(payload.initiator.persona.business_description),
            "receiver_profile": build_participant_profile(payload.receiver.persona.business_description),
        },
    )