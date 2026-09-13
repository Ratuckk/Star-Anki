import { buildDeck } from './anki.js'
import { listDecks, addDeck, updateDeck, removeDeck, getDeck } from './decks.js'
import { showScreen } from './hud-shared.js'

// Extraído de hud.js na refatoração que separa cada tela em seu próprio arquivo. Zero mudança
// de comportamento.
export function showDeckManager({ onPlay, onPlayMerged, onBack, startInAdd = false }) {
  showScreen('deckManager')
  const root = document.getElementById('deck-manager-screen')

  let view = startInAdd ? 'add' : 'list'
  let editingId = null
  const expandedPreview = new Set()
  const expandedExtras = new Set()
  const selectedForMerge = new Set()

  render()

  function render() {
    root.innerHTML = ''

    const back = document.createElement('button')
    back.className = 'back-link'
    back.textContent = '← Voltar'
    back.addEventListener('click', onBack)
    root.appendChild(back)

    if (view === 'list') renderList()
    else if (view === 'add') renderAddForm()
    else if (view === 'edit') renderEditForm()
  }

  function renderList() {
    const title = document.createElement('h2')
    title.textContent = 'Baralhos salvos'
    root.appendChild(title)

    const decks = listDecks()

    if (decks.length === 0) {
      const empty = document.createElement('p')
      empty.textContent = 'Nenhum baralho salvo ainda.'
      root.appendChild(empty)
    }

    const list = document.createElement('div')
    list.className = 'deck-list'
    for (const d of decks) list.appendChild(buildDeckCard(d))
    root.appendChild(list)

    const validCount = decks.filter((d) => d.valid).length
    if (validCount >= 2) root.appendChild(buildMergeBar())

    const addBtn = document.createElement('button')
    addBtn.textContent = 'Adicionar baralho'
    addBtn.addEventListener('click', () => { view = 'add'; render() })
    root.appendChild(addBtn)
  }

  function buildMergeBar() {
    const bar = document.createElement('div')
    bar.className = 'deck-merge-bar'

    const label = document.createElement('span')
    label.textContent = selectedForMerge.size >= 2
      ? `${selectedForMerge.size} baralhos marcados`
      : 'Marque 2+ baralhos pra fundir numa sessão só'
    bar.appendChild(label)

    const mergeBtn = document.createElement('button')
    mergeBtn.className = 'btn-small'
    mergeBtn.textContent = 'Jogar fundidos'
    mergeBtn.disabled = selectedForMerge.size < 2
    mergeBtn.addEventListener('click', () => onPlayMerged([...selectedForMerge]))
    bar.appendChild(mergeBtn)

    return bar
  }

  function buildDeckCard(d) {
    const card = document.createElement('div')
    card.className = 'deck-card' + (d.valid ? '' : ' invalid')

    const name = document.createElement('p')
    name.className = 'deck-card-name'
    name.textContent = d.name
    card.appendChild(name)

    const meta = document.createElement('p')
    meta.className = 'deck-card-meta'
    meta.textContent = d.valid
      ? `${d.shooterCount} pergunta${d.shooterCount === 1 ? '' : 's'} de combate · ${d.painelCount} de painel`
      : `Inválido: ${d.warning}`
    card.appendChild(meta)

    const btnRow = document.createElement('div')
    btnRow.className = 'btn-row'

    if (d.valid) {
      const playBtn = document.createElement('button')
      playBtn.className = 'btn-small'
      playBtn.textContent = 'Jogar'
      playBtn.addEventListener('click', () => onPlay(d.id))
      btnRow.appendChild(playBtn)

      const mergeLabel = document.createElement('label')
      mergeLabel.className = 'deck-merge-checkbox'
      const mergeCheckbox = document.createElement('input')
      mergeCheckbox.type = 'checkbox'
      mergeCheckbox.checked = selectedForMerge.has(d.id)
      mergeCheckbox.addEventListener('change', () => {
        if (mergeCheckbox.checked) selectedForMerge.add(d.id)
        else selectedForMerge.delete(d.id)
        render()
      })
      mergeLabel.appendChild(mergeCheckbox)
      mergeLabel.appendChild(document.createTextNode(' fundir'))
      btnRow.appendChild(mergeLabel)
    }

    const editBtn = document.createElement('button')
    editBtn.className = 'btn-small btn-secondary'
    editBtn.textContent = 'Editar'
    editBtn.addEventListener('click', () => { view = 'edit'; editingId = d.id; render() })
    btnRow.appendChild(editBtn)

    const delBtn = document.createElement('button')
    delBtn.className = 'btn-small btn-danger'
    delBtn.textContent = 'Excluir'
    delBtn.addEventListener('click', () => {
      if (!window.confirm(`Excluir o baralho "${d.name}"?`)) return
      removeDeck(d.id)
      render()
    })
    btnRow.appendChild(delBtn)

    card.appendChild(btnRow)

    if (d.valid) {
      const previewToggle = document.createElement('button')
      previewToggle.className = 'disclosure-toggle'
      previewToggle.textContent = expandedPreview.has(d.id) ? 'Ocultar perguntas ▲' : 'Ver perguntas ▾'
      previewToggle.addEventListener('click', () => {
        if (expandedPreview.has(d.id)) expandedPreview.delete(d.id)
        else expandedPreview.add(d.id)
        render()
      })
      card.appendChild(previewToggle)

      if (expandedPreview.has(d.id)) card.appendChild(buildPreview(d.id))
    }

    return card
  }

  function buildPreview(id) {
    const entry = getDeck(id)
    const built = buildDeck(entry.text)
    const wrap = document.createElement('div')
    wrap.className = 'deck-preview'

    const shooterTitle = document.createElement('p')
    shooterTitle.textContent = `Perguntas normais (${built.shooterCards.length})`
    wrap.appendChild(shooterTitle)
    const shooterList = document.createElement('ul')
    for (const c of built.shooterCards) {
      const li = document.createElement('li')
      li.textContent = c.question
      shooterList.appendChild(li)
    }
    wrap.appendChild(shooterList)

    if (built.painelCards.length > 0) {
      const extrasToggle = document.createElement('button')
      extrasToggle.className = 'disclosure-toggle'
      extrasToggle.textContent = expandedExtras.has(id)
        ? 'Ocultar perguntas extra ▲'
        : `Mostrar perguntas extra (${built.painelCards.length}) ▾`
      extrasToggle.addEventListener('click', () => {
        if (expandedExtras.has(id)) expandedExtras.delete(id)
        else expandedExtras.add(id)
        render()
      })
      wrap.appendChild(extrasToggle)

      if (expandedExtras.has(id)) {
        const extrasList = document.createElement('ul')
        for (const c of built.painelCards) {
          const li = document.createElement('li')
          li.textContent = c.question
          extrasList.appendChild(li)
        }
        wrap.appendChild(extrasList)
      }
    }

    return wrap
  }

  function renderAddForm() {
    const title = document.createElement('h2')
    title.textContent = 'Adicionar baralho'
    root.appendChild(title)

    const p = document.createElement('p')
    p.textContent = 'Carregue um baralho exportado do Anki (formato .txt, notas com campos separados).'
    root.appendChild(p)

    const nameLabel = document.createElement('label')
    nameLabel.textContent = 'Nome do baralho'
    root.appendChild(nameLabel)
    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.placeholder = 'Ex: Arquitetura de computadores'
    root.appendChild(nameInput)

    const fileLabel = document.createElement('label')
    fileLabel.textContent = 'Arquivo .txt'
    root.appendChild(fileLabel)
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.txt'
    root.appendChild(fileInput)

    const textLabel = document.createElement('label')
    textLabel.textContent = 'Ou cole o texto exportado'
    root.appendChild(textLabel)
    const textarea = document.createElement('textarea')
    textarea.rows = 8
    textarea.placeholder = 'Cole aqui o conteúdo exportado do Anki'
    root.appendChild(textarea)

    const message = document.createElement('div')
    message.className = 'form-message'
    root.appendChild(message)

    const btnRow = document.createElement('div')
    btnRow.className = 'btn-row'

    const submitBtn = document.createElement('button')
    submitBtn.textContent = 'Salvar baralho'
    submitBtn.addEventListener('click', () => {
      message.textContent = ''
      const file = fileInput.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = () => submit(String(reader.result))
        reader.readAsText(file)
        return
      }
      const pasted = textarea.value.trim()
      if (!pasted) {
        message.textContent = 'Selecione um arquivo .txt ou cole o texto exportado.'
        return
      }
      submit(pasted)
    })
    btnRow.appendChild(submitBtn)

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'btn-secondary'
    cancelBtn.textContent = 'Cancelar'
    cancelBtn.addEventListener('click', () => { view = 'list'; render() })
    btnRow.appendChild(cancelBtn)

    root.appendChild(btnRow)

    function submit(text) {
      const name = nameInput.value.trim() || 'Baralho sem nome'
      const result = addDeck(name, text)
      if (result.error) { message.textContent = result.error; return }
      view = 'list'
      render()
    }
  }

  function renderEditForm() {
    const entry = getDeck(editingId)
    if (!entry) { view = 'list'; render(); return }

    const title = document.createElement('h2')
    title.textContent = 'Editar baralho'
    root.appendChild(title)

    const nameLabel = document.createElement('label')
    nameLabel.textContent = 'Nome do baralho'
    root.appendChild(nameLabel)
    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.value = entry.name
    root.appendChild(nameInput)

    const textLabel = document.createElement('label')
    textLabel.textContent = 'Texto exportado'
    root.appendChild(textLabel)
    const textarea = document.createElement('textarea')
    textarea.rows = 16
    textarea.value = entry.text
    root.appendChild(textarea)

    const message = document.createElement('div')
    message.className = 'form-message'
    root.appendChild(message)

    const btnRow = document.createElement('div')
    btnRow.className = 'btn-row'

    const saveBtn = document.createElement('button')
    saveBtn.textContent = 'Salvar'
    saveBtn.addEventListener('click', () => {
      const result = updateDeck(editingId, { name: nameInput.value.trim(), text: textarea.value })
      if (result.error) { message.textContent = result.error; return }
      view = 'list'
      render()
    })
    btnRow.appendChild(saveBtn)

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'btn-secondary'
    cancelBtn.textContent = 'Cancelar'
    cancelBtn.addEventListener('click', () => { view = 'list'; render() })
    btnRow.appendChild(cancelBtn)

    const delBtn = document.createElement('button')
    delBtn.className = 'btn-danger'
    delBtn.textContent = 'Excluir baralho'
    delBtn.addEventListener('click', () => {
      if (!window.confirm(`Excluir o baralho "${entry.name}"?`)) return
      removeDeck(editingId)
      view = 'list'
      render()
    })
    btnRow.appendChild(delBtn)

    root.appendChild(btnRow)
  }
}
