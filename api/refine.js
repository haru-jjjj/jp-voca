// Vercel Serverless Function
// 단어장에 이미 저장된 단어 하나를 대상으로, 사용자가 적어준 메모(오류 지적/추가 정보)를 반영해
// Claude가 그 항목만 다시 다듬어서 돌려준다. (여러 단어를 새로 만드는 api/generate.js와는 별개 기능)
// ANTHROPIC_API_KEY는 여기(서버)에서만 사용되고 브라우저에는 절대 노출되지 않는다.

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001'

export const config = { maxDuration: 30 }

const SYSTEM_PROMPT = `너는 일본어 단어장에 이미 저장된 항목 하나를 수정하는 도우미다.
사용자가 기존 항목(JSON)과, 그 항목에서 잘못됐다고 생각하는 점이나 추가로 알려주는 정보(메모)를 함께 준다.
그 메모 내용을 정확히 반영해서 항목을 고친 뒤, 아래 스키마의 JSON 객체 하나만 응답한다.
다른 설명, 마크다운, 코드블록 표시 없이 순수 JSON 객체만 출력한다.

스키마:
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
- 사용자 메모에서 명시적으로 지적하거나 요청한 부분은 정확하게 반영한다.
- 메모와 관련 없는 필드는 원래 값이 맞다면 그대로 유지한다. 다만 원래 값 자체가 메모 내용과 모순되거나 명백히 잘못됐다면 함께 바로잡는다.
- 단어 표기(word) 자체는 사용자가 명시적으로 바꿔달라고 하지 않는 한 그대로 유지한다.
- 단어나 뜻이 바뀌어서 기존 예문이 더 이상 맞지 않게 되면, 예문/예문 읽는법/예문 뜻도 자연스럽게 새로 만든다.
- 응답은 반드시 유효한 JSON 객체 하나여야 한다. 객체 바깥에 아무 텍스트도 붙이지 않는다.`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY가 서버(Vercel 환경변수)에 설정되어 있지 않습니다.',
    })
  }

  const { word, note } = req.body || {}
  if (!word || typeof word !== 'object') {
    return res.status(400).json({ error: '수정할 단어 정보가 없습니다.' })
  }
  if (!note || typeof note !== 'string' || !note.trim()) {
    return res.status(400).json({ error: '무엇을 고쳐야 하는지 메모를 입력해주세요.' })
  }

  const existing = {
    word: word.word || '',
    reading: word.reading || '',
    meaning: word.meaning || '',
    example: word.example || '',
    exampleReading: word.exampleReading || '',
    exampleMeaning: word.exampleMeaning || '',
    tags: Array.isArray(word.tags) ? word.tags : [],
  }

  const userMessage = `기존 항목:\n${JSON.stringify(existing, null, 2)}\n\n사용자 메모(수정 요청/추가 정보):\n${note
    .trim()
    .slice(0, 2000)}`

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
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return res.status(response.status).json({ error: `Claude API 오류: ${errText}` })
    }

    const data = await response.json()
    const textBlock = data?.content?.find((c) => c.type === 'text')
    const raw = textBlock?.text || ''

    const entry = parseEntry(raw)
    if (entry === null) {
      return res.status(502).json({
        error: 'Claude 응답을 JSON으로 해석하지 못했습니다.',
        raw: raw.slice(0, 2000),
      })
    }

    return res.status(200).json({ entry })
  } catch (err) {
    return res.status(500).json({ error: `서버 오류: ${err.message}` })
  }
}

function parseEntry(raw) {
  const cleaned = raw.trim().replace(/^```json\s*|^```\s*|```\s*$/g, '')

  try {
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed[0] || null : parsed
  } catch {
    // 아래 fallback으로
  }

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      // 무시하고 null 반환
    }
  }

  return null
}
