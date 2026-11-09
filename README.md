# 🚐 Van Petualang 3D

Game petualangan 3D di browser (Three.js + Vite). Kemudikan van klasik keliling Pulau Pelangi, selesaikan 5 misi, kumpulkan 40 koin emas, dan jaga bensin.

## Menjalankan

```bash
pnpm install
pnpm dev      # buka http://localhost:5173
pnpm build    # hasil statis di dist/
```

## Kontrol

| Tombol | Aksi |
| --- | --- |
| W / ↑ | Gas |
| S / ↓ | Rem & mundur |
| A D / ← → | Belok |
| Shift | Turbo (boros bensin) |
| Spasi | Rem tangan (drift) |
| H | Klakson |
| C | Ganti kamera (dekat / jauh / kabin) |
| R | Kembalikan van jika terjebak |
| M | Suara on/off |

Di HP/tablet tersedia tombol sentuh di layar.

## Fitur

- Pulau low-poly prosedural: danau, gunung bersalju, pantai, hutan.
- Misi berurutan: Danau Biru → Mercusuar Tua → Puncak Elang → Reruntuhan Kuno → pulang ke Desa.
- Kompas, minimap, dan pilar cahaya penunjuk tujuan.
- Sistem bensin: jeriken merah (+35) dan SPBU di desa; kehabisan bensin = panggil derek.
- Siklus siang–malam dengan lampu depan van, bintang, dan mercusuar berputar.
- Fisika arkade: tanjakan, lompatan dari bukit, tabrakan pohon/batu.
- Efek suara sintetis (mesin, klakson, koin) tanpa file aset.
