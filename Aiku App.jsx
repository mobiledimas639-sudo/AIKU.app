```react
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Trash2, MessageSquare, Sparkles, X, Paperclip, Menu, Plus, MessageCircle, Cloud, CloudOff } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// --- 1. KONFIGURASI AMAN FIREBASE & API GEMINI ---
let aplikasiFirebase, auth, db, idAplikasi;
try {
  const konfigurasiFirebase = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : {
        apiKey: import.meta.env?.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env?.VITE_FIREBASE_APP_ID
      };

  aplikasiFirebase = initializeApp(konfigurasiFirebase);
  auth = getAuth(aplikasiFirebase);
  db = getFirestore(aplikasiFirebase);
  idAplikasi = typeof __app_id !== 'undefined' ? __app_id : 'aplikasi-aiku';
} catch (e) {
  console.warn("Jalan di mode lokal (tanpa firebase)");
}

// Otomatis pakai API Key Anda jika .env tidak terbaca di HP
const KUNCI_API_GEMINI = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) 
  ? import.meta.env.VITE_GEMINI_API_KEY 
  : "sk-xt-c169bf234561a82af356c1084657ca76b3211e00c941961b";

// --- 2. FUNGSI FORMAT TEKS (MARKDOWN) ---
const formatTeks = (teks) => {
  if (!teks) return null;
  const baris = teks.split('\n');
  const elemen = [];
  let dalamDaftar = false;
  let itemDaftar = [];

  const parseTebalMiring = (str) => {
    const bagian = str.split(/(\*\*.*?\*\*|\*.*?\*)/g);
    return bagian.map((bag, indeks) => {
      if (bag.startsWith('**') && bag.endsWith('**')) {
        return <strong key={indeks} className="font-bold text-slate-900">{bag.slice(2, -2)}</strong>;
      } else if (bag.startsWith('*') && bag.endsWith('*')) {
        return <em key={indeks} className="italic text-slate-700">{bag.slice(1, -1)}</em>;
      }
      return bag;
    });
  };

  for (let i = 0; i < baris.length; i++) {
    const barisTeks = baris[i];
    const cocokDaftar = barisTeks.match(/^(\s*[-*]|\s*\d+\.)\s+(.*)/);

    if (cocokDaftar) {
      dalamDaftar = true;
      itemDaftar.push(
        <li key={'li-'+i} className="ml-5 mb-1.5 leading-relaxed text-slate-700">
          {parseTebalMiring(cocokDaftar[2])}
        </li>
      );
    } else {
      if (dalamDaftar) {
        elemen.push(<ul key={'ul-'+i} className="list-disc list-outside mb-4 space-y-1">{itemDaftar}</ul>);
        dalamDaftar = false;
        itemDaftar = [];
      }
      elemen.push(
        <div key={'p-'+i} className={`leading-relaxed text-slate-700 ${barisTeks.trim() === '' ? 'h-2' : 'mb-3'}`}>
          {parseTebalMiring(barisTeks)}
        </div>
      );
    }
  }

  if (dalamDaftar) {
    elemen.push(<ul key="ul-akhir" className="list-disc list-outside mb-4 space-y-1">{itemDaftar}</ul>);
  }

  return elemen;
};

// --- 3. KOMPONEN UTAMA ---
export default function App() {
  const pesanAwalDefault = { peran: 'ai', teks: 'Halo! Saya AIKU, asisten pintar Anda. Kirimkan pesan, foto, atau video untuk berdiskusi.' };

  const [tampilSplash, setTampilSplash] = useState(true);
  const [animasiKeluarSplash, setAnimasiKeluarSplash] = useState(false);
  const [penggunaAktif, setPenggunaAktif] = useState(null);
  const [statusDatabase, setStatusDatabase] = useState('memuat');

  const [sesiObrolan, setSesiObrolan] = useState([{ id: 'default', judul: 'Obrolan Baru', pesan: [pesanAwalDefault] }]);
  const [idSesiAktif, setIdSesiAktif] = useState('default');
  const [sidebarBuka, setSidebarBuka] = useState(false);
  const [inputTeks, setInputTeks] = useState('');
  const [sedangMemuat, setSedangMemuat] = useState(false);
  const [lampiran, setLampiran] = useState(null); 
  
  const akhirPesanRef = useRef(null);
  const inputTeksRef = useRef(null);
  const inputFileRef = useRef(null);

  // Efek Splash Screen
  useEffect(() => {
    const timer = setTimeout(lewatiSplashScreen, 3500);
    return () => clearTimeout(timer);
  }, []);

  const lewatiSplashScreen = () => {
    setAnimasiKeluarSplash(true);
    setTimeout(() => setTampilSplash(false), 800); 
  };

  // Auth Firebase
  useEffect(() => {
    if (!auth) {
      setStatusDatabase('offline');
      return;
    }
    
    const inisialisasiAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        setStatusDatabase('error');
      }
    };
    
    inisialisasiAuth();
    const berhentiPantau = onAuthStateChanged(auth, (user) => setPenggunaAktif(user));
    return () => berhentiPantau();
  }, []);

  // Database Sync
  useEffect(() => {
    if (!penggunaAktif || !db) return;

    const referensiKoleksi = collection(db, 'artifacts', idAplikasi, 'users', penggunaAktif.uid, 'riwayat_obrolan');
    const berhentiSinkronisasi = onSnapshot(referensiKoleksi, (snapshot) => {
      const dataDariCloud = [];
      snapshot.forEach((dokumen) => dataDariCloud.push({ id: dokumen.id, ...dokumen.data() }));
      dataDariCloud.sort((a, b) => Number(b.id) - Number(a.id));

      if (dataDariCloud.length === 0) {
        const idBaru = Date.now().toString();
        const sesiBaru = { id: idBaru, judul: 'Obrolan Baru', pesan: [pesanAwalDefault] };
        simpanKeCloud(idBaru, sesiBaru);
        setSesiObrolan([sesiBaru]);
        setIdSesiAktif(idBaru);
      } else {
        setSesiObrolan(dataDariCloud);
        if (!idSesiAktif || !dataDariCloud.find(s => s.id === idSesiAktif)) {
          setIdSesiAktif(dataDariCloud[0].id);
        }
      }
      setStatusDatabase('terhubung');
    }, () => setStatusDatabase('error'));

    return () => berhentiSinkronisasi();
  }, [penggunaAktif]);

  const sesiAktif = sesiObrolan.find(s => s.id === idSesiAktif) || sesiObrolan[0];

  useEffect(() => {
    akhirPesanRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sesiAktif.pesan, sedangMemuat]);

  const simpanKeCloud = async (idSesi, dataSesi) => {
    if (!penggunaAktif || !db) return;
    try {
      const referensiDokumen = doc(db, 'artifacts', idAplikasi, 'users', penggunaAktif.uid, 'riwayat_obrolan', idSesi);
      await setDoc(referensiDokumen, dataSesi);
    } catch (e) { console.log(e); }
  };

  const hapusDariCloud = async (idSesi) => {
    if (!penggunaAktif || !db) return;
    try {
      const referensiDokumen = doc(db, 'artifacts', idAplikasi, 'users', penggunaAktif.uid, 'riwayat_obrolan', idSesi);
      await deleteDoc(referensiDokumen);
    } catch (e) { console.log(e); }
  };

  const tanganiPilihFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const urlTampil = URL.createObjectURL(file);

    if (isVideo) {
      setLampiran({ tipe: 'video', urlTampil, sedangProses: true });
      const video = document.createElement('video');
      video.src = urlTampil;
      video.muted = true;
      video.currentTime = 1; 
      
      video.onloadeddata = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        setLampiran({ tipe: 'video', urlTampil, dataInline: { mimeType: 'image/jpeg', data: canvas.toDataURL('image/jpeg').split(',')[1] } });
      };
      video.onerror = () => { alert("Gagal memproses video."); setLampiran(null); };
    } else {
      const pembaca = new FileReader();
      pembaca.onload = (event) => setLampiran({ tipe: 'image', urlTampil, dataInline: { mimeType: file.type, data: event.target.result.split(',')[1] } });
      pembaca.readAsDataURL(file);
    }
    
    if (inputFileRef.current) inputFileRef.current.value = '';
    inputTeksRef.current?.focus();
  };

  const panggilAPI = async (riwayatPesan) => {
    const url = "[https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=](https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=)" + KUNCI_API_GEMINI;
    const contents = riwayatPesan.map(msg => {
      const parts = [{ text: msg.teks || "Tolong jelaskan gambar ini" }]; 
      if (msg.lampiran) parts.push({ inlineData: msg.lampiran });
      return { role: msg.peran === 'pengguna' ? 'user' : 'model', parts };
    });

    for (let i = 0; i < 6; i++) {
      try {
        const respon = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents }) });
        if (!respon.ok) throw new Error('API Error');
        const data = await respon.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, saya tidak mengerti.";
      } catch (error) {
        if (i === 5) return "Terjadi masalah jaringan, mohon periksa koneksi Anda.";
        await new Promise(r => setTimeout(r, [1000, 2000, 4000, 8000, 16000][i]));
      }
    }
  };

  const tanganiKirim = async (e) => {
    if (e) e.preventDefault();
    if ((!inputTeks.trim() && !lampiran) || sedangMemuat) return;

    const teksBaru = inputTeks.trim();
    const pesanPengguna = { peran: 'pengguna', teks: teksBaru, lampiran: lampiran?.dataInline, urlTampil: lampiran?.urlTampil };
    const sesiDiperbarui = { ...sesiAktif };
    
    if (sesiDiperbarui.pesan.length === 1 && teksBaru) {
      sesiDiperbarui.judul = teksBaru.slice(0, 25) + (teksBaru.length > 25 ? '...' : '');
    }
    sesiDiperbarui.pesan = [...sesiDiperbarui.pesan, pesanPengguna];

    if (penggunaAktif) await simpanKeCloud(sesiDiperbarui.id, sesiDiperbarui);
    else setSesiObrolan(prev => prev.map(s => s.id === sesiDiperbarui.id ? sesiDiperbarui : s));
    
    setInputTeks('');
    setLampiran(null);
    setSedangMemuat(true);

    const jawabanAI = await panggilAPI(sesiDiperbarui.pesan);
    sesiDiperbarui.pesan = [...sesiDiperbarui.pesan, { peran: 'ai', teks: jawabanAI }];
    
    if (penggunaAktif) await simpanKeCloud(sesiDiperbarui.id, sesiDiperbarui);
    else setSesiObrolan(prev => prev.map(s => s.id === sesiDiperbarui.id ? sesiDiperbarui : s));
    
    setSedangMemuat(false);
  };

  const buatObrolanBaru = async () => {
    const idBaru = Date.now().toString();
    const sesiBaru = { id: idBaru, judul: 'Obrolan Baru', pesan: [pesanAwalDefault] };
    
    if (penggunaAktif) await simpanKeCloud(idBaru, sesiBaru);
    else setSesiObrolan([sesiBaru, ...sesiObrolan]);
    
    setIdSesiAktif(idBaru);
    setLampiran(null);
    setInputTeks('');
    if (window.innerWidth < 768) setSidebarBuka(false);
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-slate-800 font-sans selection:bg-blue-200 overflow-hidden relative">
      
      {tampilSplash && (
        <div onClick={lewatiSplashScreen} className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white cursor-pointer transition-all duration-700 ease-in-out ${animasiKeluarSplash ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100 scale-100'}`}>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[20%] left-[20%] w-64 h-64 bg-blue-300/30 rounded-full blur-[80px] animate-pulse"></div>
            <div className="absolute bottom-[20%] right-[20%] w-72 h-72 bg-indigo-300/30 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '1s' }}></div>
          </div>
          <div className="relative z-10 flex flex-col items-center animate-in zoom-in-75 duration-700 fade-in">
            <div className="relative group">
              <div className="absolute inset-0 bg-blue-500 rounded-3xl animate-ping opacity-25 duration-1000"></div>
              <div className="relative bg-gradient-to-br from-blue-600 to-indigo-600 p-6 rounded-3xl shadow-2xl shadow-blue-500/40">
                <Sparkles size={56} className="text-white animate-pulse" />
              </div>
            </div>
            <h1 className="mt-8 text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-700 tracking-tighter">AIKU</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500 tracking-[0.2em] uppercase">Asisten Pintar Anda</p>
            <div className="absolute -bottom-24 flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      )}

      {sidebarBuka && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden transition-opacity" onClick={() => setSidebarBuka(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-slate-300 transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl md:relative md:translate-x-0 ${sidebarBuka ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 px-2">
            <Sparkles size={20} className="text-blue-400" />
            <span className="font-bold text-lg text-white tracking-wide">AIKU History</span>
          </div>
          <button onClick={() => setSidebarBuka(false)} className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"><X size={20} /></button>
        </div>

        <div className="px-4 py-2 border-b border-slate-800/50 text-[10px] uppercase font-bold flex items-center justify-center gap-2">
          {statusDatabase === 'terhubung' ? (<><Cloud size={12} className="text-emerald-400" /> <span className="text-emerald-400/80">Tersinkronisasi</span></>) : statusDatabase === 'memuat' ? (<><Cloud size={12} className="text-blue-400 animate-pulse" /> <span className="text-blue-400/80">Menghubungkan...</span></>) : (<><CloudOff size={12} className="text-rose-400" /> <span className="text-rose-400/80">Mode Lokal (Offline)</span></>)}
        </div>

        <div className="p-4">
          <button onClick={buatObrolanBaru} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-medium transition-all shadow-md shadow-blue-900/50 hover:shadow-blue-900/80">
            <Plus size={18} /> Obrolan Baru
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-4">
          {sesiObrolan.map((sesi) => (
            <div key={sesi.id} onClick={() => { setIdSesiAktif(sesi.id); if (window.innerWidth < 768) setSidebarBuka(false); }} className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors duration-200 ${sesi.id === idSesiAktif ? 'bg-slate-800 text-white shadow-inner' : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'}`}>
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageCircle size={16} className={`shrink-0 ${sesi.id === idSesiAktif ? 'text-blue-400' : 'text-slate-500'}`} />
                <span className="truncate text-sm font-medium">{sesi.judul}</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); hapusDariCloud(sesi.id); if(!penggunaAktif) setSesiObrolan(prev => prev.filter(s => s.id !== sesi.id)); }} className={`p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 transition-colors ${sesi.id === idSesiAktif ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 md:opacity-0'}`}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-screen relative">
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 sm:px-6 flex items-center gap-3 shadow-sm">
          <button onClick={() => setSidebarBuka(!sidebarBuka)} className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"><Menu size={24} /></button>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-xl text-white shadow-md shadow-blue-500/20"><Sparkles size={20} className="animate-pulse" /></div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-700 tracking-tight">AIKU</h1>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium tracking-wide">{sesiAktif.judul || "Memuat..."}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 w-full max-w-4xl mx-auto space-y-6 scroll-smooth">
          {sesiAktif.pesan && sesiAktif.pesan.map((msg, index) => (
            <div key={index} className={`flex items-end gap-3 ${msg.peran === 'pengguna' ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in slide-in-from-bottom-3 duration-300`}>
              <div className={`shrink-0 p-2.5 rounded-full shadow-sm mb-1 ${msg.peran === 'pengguna' ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white' : 'bg-white border border-slate-200 text-indigo-600'}`}>
                {msg.peran === 'pengguna' ? <User size={18} /> : <Bot size={18} />}
              </div>
              <div className="flex flex-col gap-2 max-w-[85%] sm:max-w-[80%]">
                {msg.urlTampil && (
                  <div className={`overflow-hidden rounded-2xl shadow-sm border border-slate-100 p-1 ${msg.peran === 'pengguna' ? 'bg-blue-50 self-end' : 'bg-white self-start'}`}>
                    <img src={msg.urlTampil} alt="Lampiran" className="rounded-xl max-h-64 object-contain" />
                  </div>
                )}
                {msg.teks && (
                  <div className={`px-5 py-3.5 shadow-sm text-[15px] ${msg.peran === 'pengguna' ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-3xl rounded-br-sm' : 'bg-white border border-slate-200/60 text-slate-700 rounded-3xl rounded-bl-sm'}`}>
                    {msg.peran === 'pengguna' ? <div className="whitespace-pre-wrap leading-relaxed">{msg.teks}</div> : <div className="text-slate-700">{formatTeks(msg.teks)}</div>}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sedangMemuat && (
            <div className="flex items-end gap-3 animate-in fade-in duration-300">
              <div className="shrink-0 p-2.5 rounded-full bg-white border border-slate-200 text-indigo-600 shadow-sm mb-1"><Bot size={18} /></div>
              <div className="bg-white border border-slate-200/60 rounded-3xl rounded-bl-sm px-5 py-4 shadow-sm flex items-center gap-2.5">
                <span className="flex gap-1.5">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </span>
                <span className="ml-2 text-sm font-medium text-slate-400">Mengetik...</span>
              </div>
            </div>
          )}
          <div ref={akhirPesanRef} className="h-2" />
        </main>

        <footer className="bg-white/90 backdrop-blur-md border-t border-slate-200 p-3 sm:p-5 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] relative z-10">
          <div className="max-w-4xl mx-auto">
            {lampiran && (
              <div className="mb-3 flex items-center">
                <div className="relative group inline-block rounded-xl border border-slate-200 bg-slate-50 p-1 pr-3 shadow-sm animate-in zoom-in-95 duration-200">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-200 flex items-center justify-center">
                      {lampiran.sedangProses ? ( <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>) : ( <img src={lampiran.urlTampil} alt="Preview" className="w-full h-full object-cover" />)}
                    </div>
                    <div className="flex flex-col text-sm text-slate-600"><span className="font-semibold">{lampiran.tipe === 'video' ? 'Video' : 'Gambar'} Dilampirkan</span></div>
                    <button type="button" onClick={() => setLampiran(null)} className="ml-2 p-1.5 bg-slate-200 hover:bg-red-100 hover:text-red-600 rounded-full"><X size={14} /></button>
                  </div>
                </div>
              </div>
            )}
            <form onSubmit={tanganiKirim} className="relative flex items-end gap-2 sm:gap-3 bg-white rounded-3xl border border-slate-200 shadow-sm p-1.5 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all duration-300">
              <button type="button" onClick={() => inputFileRef.current?.click()} className="shrink-0 p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-colors self-end mb-0.5"><Paperclip size={22} className="rotate-45" /></button>
              <input type="file" ref={inputFileRef} onChange={tanganiPilihFile} accept="image/*, video/*" className="hidden" />
              <textarea ref={inputTeksRef} value={inputTeks} onChange={(e) => setInputTeks(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); tanganiKirim(); } }} placeholder="Ketik pesan..." className="flex-1 max-h-32 min-h-[48px] bg-transparent resize-none py-3 px-2 outline-none text-slate-700 placeholder:text-slate-400 font-medium self-center" rows={1} />
              <button type="submit" disabled={(!inputTeks.trim() && !lampiran) || sedangMemuat} className="shrink-0 p-3.5 m-0.5 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-50 transition-all duration-200 self-end"><Send size={20} className={sedangMemuat ? "opacity-50" : "ml-0.5"} /></button>
            </form>
          </div>
        </footer>
      </div>
    </div>
  );
}
```