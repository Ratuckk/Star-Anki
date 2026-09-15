// Service worker do "app" instalável do Star Anki. Estratégia pensada pro fato de o projeto não
// ter build/bundler (ES modules nativos, dezenas de arquivos em src/**/*.js que mudam a toda
// entrega) — em vez de manter uma lista fixa de arquivos pra pré-cachear (que ficaria
// desatualizada a cada inimigo/tela novos), o cache é só uma camada de fallback OFFLINE:
//
//   - arquivos do PRÓPRIO jogo (mesma origem): network-first. Toda vez que o navegador busca um
//     arquivo, tenta a rede PRIMEIRO — se o deploy mudou o arquivo, é isso que chega; o cache só
//     é atualizado com a resposta fresca e usado como fallback se a rede falhar (offline). É
//     assim que o app se atualiza sozinho a cada nova versão publicada, sem precisar de nenhuma
//     lógica de "versão" aqui — a rede sempre tem a palavra final quando disponível.
//   - CDN de terceiro com versão fixa no import map (three@0.169.0): cache-first. Essa URL nunca
//     muda de conteúdo pra essa versão (convenção do jsdelivr), então não tem por que rebaixar
//     de novo toda vez — só busca na rede se ainda não tiver em cache.
const CACHE_NAME = 'star-anki-shell-v1'
const CORE_ASSETS = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (url.origin !== location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
        return res
      })),
    )
    return
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
        return res
      })
      .catch(() => caches.match(req).then((cached) => cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))),
  )
})
