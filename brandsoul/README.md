# BrandSoul Backend

Backend inicial em FastAPI para a Centelha de uma marca responder mensagens com personalidade.

## Requisitos

- Python 3.10+
- Variavel de ambiente `OPENAI_API_KEY`

## Instalar dependencias

```bash
pip install -r requirements.txt
```

## Rodar localmente

```bash
uvicorn main:app --reload
```

Servidor padrao:

```text
http://127.0.0.1:8000
```

Swagger:

```text
http://127.0.0.1:8000/docs
```

## Teste com curl

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "brand_name": "BrandSoul",
    "message": "Como voce transforma uma marca em algo memoravel?",
    "persona": {
      "tone": "divertido",
      "power": "atracao"
    }
  }'
```

## Exemplo de resposta

```json
{
  "response": "A gente nao veste marcas com maquiagem. A gente acende presenca, desejo e lembranca."
}
```