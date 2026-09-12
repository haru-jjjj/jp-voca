// Vercel Serverless Function
// 브라우저에서 넘어온 원문 텍스트(단어 하나 또는 Notion에서 붙여넣은 뭉텅이 텍스트)를
// Claude API에 보내 구조화된 일본어 단어장 항목 배열로 변환해서 돌려준다.
// ANTHROPIC_API_KEY는 여기(서버)에서만 사용되고 브라우저에는 절대 노출되지 않는다.

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001'

// 한 번에 많은 단어를 보내면 응답 생성에 시간이 걸릴 수 있어 함수 실행 시간을 넉넉히 잡는다.
export const config = { maxDuration: 60 }

const SYSTEM_PROMPT = `너는 일본어 학습자를 위한 단어장 정리 도우미다.
사용자가 입력한 원문(단어 하나일 수도 있고, Notion에 정리해둔 여러 단어/문장이 뒤섞인 긴 텍스트일 수도 있음)에서
일본어 단어(또는 표현)들을 찾아 아래 스키마의 JSON 배열로만 응답한다. 다른 설명, 마크다운, 코드블록 표시 없이 순수 JSON 배열만 출력한다.

각 항목 스키마:
{
  "word": "일본어 단어/표현 (한자 포함 원형)",
  "reading": "히라가나 읽는 법",
  "meaning": "한국어 뜻 (간결하게)",
  "example": "그 단어를 사용한 일본어 예문 (너무 길지 않게, 한 문장)",
  "exampleReading": "예문 전체의 히라가나 읽는 법",
  "exampleMeaning": "예문의 한국어 뜻",
  "tags": ["품사 등 짧은 태그, 예: 동사, N3"]
}

규칙:
- 원문에 이미 뜻/예문 등이 일부 적혀 있으면 그것을 최대한 존중해서 사용하고, 누락된 필드만 새로 채운다.
- 원문에 여러 단어가 섞여 있으면 여러 항목을 배열에 담는다.
- 예문은 자연스럽고 실생활에서 쓸 법한 짧은 문장으로 만든다.
- 이미 문장 형태(예문)만 주어졌다면, 그 문장 안의 핵심 단어를 word로 추출한다.
- 확실하지 않은 한자 표기는 일반적으로 쓰이는 표기를 사용한다.
- 응답은 반드시 유효한 JSON 배열 하나여야 한다. 배열 바깥에 아무 텍스트도 붙이지 않는다.`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error:
        'ANTHROPIC_API_KEY가 서버(Vercel 환경변수)에 설정되어 있지 않습니다.',
    })
  }

  const { rawText } = req.body || {}
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return res.status(400).json({ error: '입력 텍스트가 비어 있습니다.' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: rawText.slice(0, 12000), // 안전한 길이 제한
          },
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return res
        .status(response.status)
        .json({ error: `Claude API 오류: ${errText}` })
    }

    const data = await response.json()
    const textBlock = data?.content?.find((c) => c.type === 'text')
    const raw = textBlock?.text || ''

    const entries = parseEntries(raw)
    if (entries === null) {
      const truncated = data?.stop_reason === 'max_tokens'
      return res.status(502).json({
        error: truncated
          ? '한 번에 보낸 단어 수가 너무 많아 응답이 중간에 잘렸습니다. 메모를 좀 더 잘게 나눠서 다시 시도해주세요.'
          : 'Claude 응답을 JSON으로 해석하지 못했습니다.',
        raw: raw.slice(0, 2000),
      })
    }

    return res.status(200).json({ entries })
  } catch (err) {
    return res.status(500).json({ error: `서버 오류: ${err.message}` })
  }
}

// 모델이 코드블록으로 감싸거나 앞뒤에 설명을 붙여서 줄 경우까지 방어적으로 파싱한다.
function parseEntries(raw) {
  const cleaned = raw.trim().replace(/^```json\s*|^```\s*|```\s*$/g, '')

  try {
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    // 무시하고 아래 fallback으로
  }

  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1))
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      // 무시하고 null 반환
    }
  }

  return null
}
