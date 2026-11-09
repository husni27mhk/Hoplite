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
| G | Rumput 3D on/off (untuk perangkat lemah) |

Di HP/tablet tersedia tombol sentuh di layar.

## Fitur

- Pulau prosedural bertekstur: rumput, padang, pasir pantai, tebing batu, dan salju dicampur otomatis lewat shader sesuai ketinggian & kemiringan.
- Ribuan helai rumput 3D yang bergoyang tertiup angin dan tersibak saat dilewati van.
- Jalan tanah dari desa ke setiap lokasi misi (lebih cepat di jalan, sedikit melambat di rumput).
- Model van, rumah, pohon, batu, semak & bunga dari Kenney.
- Misi berurutan: Danau Biru → Mercusuar Tua → Puncak Elang → Reruntuhan Kuno → pulang ke Desa.
- Kompas, minimap, dan pilar cahaya penunjuk tujuan.
- Sistem bensin: jeriken merah (+35) dan SPBU di desa; kehabisan bensin = panggil derek.
- Siklus siang–malam dengan lampu depan van, bintang, dan mercusuar berputar.
- Fisika arkade: tanjakan, lompatan dari bukit, tabrakan pohon/batu.
- Efek suara sintetis (mesin, klakson, koin) tanpa file aset.

## Kredit aset (semua CC0)

- [Kenney](https://kenney.nl): Car Kit (van), City Kit Suburban (rumah), Nature Kit (pohon, palem, batu, semak, bunga). Lisensi di `public/models/LICENSE-kenney-*.txt`.
- [ambientCG](https://ambientcg.com): tekstur tanah Grass004, Ground037, Ground079S, Ground054, Rock030, Snow006. Lihat `public/textures/LICENSE.txt`.
