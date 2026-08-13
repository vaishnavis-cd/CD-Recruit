export function getEffectiveModuleType(q: any): string {
  if (!q) return 'MCQ'
  const rawType = (q.moduleType || q.type || '').toUpperCase()
  if (rawType === 'DEBUGGING') return 'DEBUGGING'
  
  const tags = q.tags || q.question?.tags || []
  if (Array.isArray(tags) && tags.includes('debugging')) return 'DEBUGGING'
  
  const prompt = (q.content?.prompt || q.prompt || q.question?.prompt || q.questionText || '').toLowerCase()
  if (prompt.includes('debugging challenge') || (prompt.includes('debugging') && (prompt.includes('fix') || prompt.includes('bug') || prompt.includes('challenge')))) {
    return 'DEBUGGING'
  }
  
  return rawType || 'MCQ'
}
