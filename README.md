# VoleiFlow

Frontend React responsivo e instalável como PWA para o VoleiFlow.

## Executar

```powershell
npm.cmd install
npm.cmd run dev
```

Em desenvolvimento, o frontend acessa `http://localhost:7000/api`. Em produção, usa `/api` no mesmo domínio. Quando a API estiver em outro domínio, defina `VITE_API_URL=https://api.exemplo.com/api` no `.env` do servidor antes de executar o build. `VITE_URL` também é aceito por compatibilidade.

## PWA e modo offline

O build registra um Service Worker que guarda o shell, assets essenciais, últimos eventos, formações e listas acessadas. Presença, faltas e observações feitas offline entram em uma fila local com UUID, retry, idempotência no backend e detecção de conflitos.

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run preview
```
