# VoleiFlow

Frontend React responsivo e instalável como PWA para o VoleiFlow.

## Executar

```powershell
npm.cmd install
npm.cmd run dev
```

Por padrão, o frontend acessa `http://localhost:7000/api`. Para outro endereço, defina `VITE_API_URL` em `.env.local`.

## PWA e modo offline

O build registra um Service Worker que guarda o shell, assets essenciais, últimos eventos, formações e listas acessadas. Presença, faltas e observações feitas offline entram em uma fila local com UUID, retry, idempotência no backend e detecção de conflitos.

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run preview
```
