import React,{useMemo,useState}from"react";

const MACHINE_NAME="TB290";
const SHEET_WEBAPP_URL=import.meta.env.VITE_GOOGLE_SCRIPT_URL||"";
const RATES={innerbetrieblich:0,ueberbetrieblich:60};

function parseDecimal(value){
  if(value===null||value===undefined)return NaN;
  const cleaned=String(value).trim().replace(/\s/g,"").replace(",",".");
  if(cleaned==="")return NaN;
  return Number(cleaned);
}

function formatHours(value){
  if(value===""||Number.isNaN(value)||value===null||value===undefined)return"—";
  return Number(value).toLocaleString("de-AT",{minimumFractionDigits:1,maximumFractionDigits:2})+" h";
}

function formatEuro(value){
  if(value===""||Number.isNaN(value)||value===null||value===undefined)return"—";
  return "€ "+Number(value).toLocaleString("de-AT",{minimumFractionDigits:2,maximumFractionDigits:2});
}

function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}

export default function App(){
  const today=new Date().toISOString().slice(0,10);

  const[form,setForm]=useState({
    datumVon:today,
    datumBis:today,
    fahrer:"",
    stundenStart:"",
    stundenEnde:"",
    diesel:"",
    einsatzart:"innerbetrieblich",
    bemerkung:""
  });

  const[message,setMessage]=useState("");
  const[sending,setSending]=useState(false);
  const[loadingLast,setLoadingLast]=useState(false);

  const startNumber=parseDecimal(form.stundenStart);
  const endNumber=parseDecimal(form.stundenEnde);
  const dieselNumber=parseDecimal(form.diesel);

  const gefahreneStunden=useMemo(()=>{
    const start=parseDecimal(form.stundenStart);
    const ende=parseDecimal(form.stundenEnde);
    if(Number.isNaN(start)||Number.isNaN(ende))return"";
    return Math.round((ende-start)*100)/100;
  },[form.stundenStart,form.stundenEnde]);

  const hasValidHours=gefahreneStunden!==""&&gefahreneStunden>=0;
  const stundensatz=RATES[form.einsatzart]??0;
  const betrag=hasValidHours?Math.round(Number(gefahreneStunden)*stundensatz*100)/100:"";

  const canSave=
    form.datumVon&&
    form.datumBis&&
    form.fahrer.trim()&&
    !Number.isNaN(startNumber)&&
    !Number.isNaN(endNumber)&&
    hasValidHours&&
    !sending;

  async function takeLastValue(){
    setMessage("");

    if(!SHEET_WEBAPP_URL){
      setMessage("Google-Script-Link fehlt noch. Bitte VITE_GOOGLE_SCRIPT_URL in Vercel eintragen.");
      return;
    }

    setLoadingLast(true);

    try{
      const response=await fetch(`${SHEET_WEBAPP_URL}?action=last&ts=${Date.now()}`);
      const data=await response.json();

      if(!data.ok||data.lastEnde===""||data.lastEnde===null||data.lastEnde===undefined){
        setMessage("Es wurde noch kein letzter Stundenzähler gefunden.");
        return;
      }

      const last=String(data.lastEnde).replace(".",",");

      setForm(current=>({
        ...current,
        stundenStart:last
      }));

      setMessage(`Letzter Stundenzähler übernommen: ${last}`);
    }catch{
      setMessage("Letzter Wert konnte nicht geladen werden. Bitte Google-Script-Bereitstellung prüfen.");
    }finally{
      setLoadingLast(false);
    }
  }

  async function saveEntry(event){
    event.preventDefault();
    setMessage("");

    if(!SHEET_WEBAPP_URL){
      setMessage("Google-Script-Link fehlt noch. Bitte VITE_GOOGLE_SCRIPT_URL in Vercel eintragen.");
      return;
    }

    if(!canSave){
      alert("Bitte alle Pflichtfelder richtig ausfüllen.");
      return;
    }

    setSending(true);

    const payload={
      maschine:MACHINE_NAME,
      datumVon:form.datumVon,
      datumBis:form.datumBis,
      fahrer:form.fahrer.trim(),
      stundenStart:startNumber,
      stundenEnde:endNumber,
      betriebsstunden:Number(gefahreneStunden),
      diesel:Number.isNaN(dieselNumber)?0:dieselNumber,
      einsatzart:form.einsatzart,
      stundensatz:stundensatz,
      betrag:Number(betrag),
      bemerkung:form.bemerkung.trim(),
      erfasstAm:new Date().toISOString()
    };

    try{
      await fetch(SHEET_WEBAPP_URL,{
        method:"POST",
        mode:"no-cors",
        headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify(payload)
      });

      setMessage("Eintrag wurde gespeichert.");

      setForm({
        datumVon:today,
        datumBis:today,
        fahrer:"",
        stundenStart:"",
        stundenEnde:"",
        diesel:"",
        einsatzart:"innerbetrieblich",
        bemerkung:""
      });
    }catch{
      setMessage("Speichern fehlgeschlagen. Bitte Internetverbindung prüfen.");
    }finally{
      setSending(false);
    }
  }

  return <div className="page"><main className="app-card">
    <header className="top">
      <div className="logo"><img src="/logo.png" alt="Takeuchi TB290" /></div>
      <div className="header-text">
        <h1>{MACHINE_NAME}</h1>
        <p>Stundenerfassung</p>
      </div>
    </header>

    {message&&<div className="message">{message}</div>}

    <form onSubmit={saveEntry} className="form">
      <section className="section">
        <h2>Zeitraum</h2>
        <div className="grid two">
          <Field label="Von">
            <input type="date" value={form.datumVon} onChange={e=>setForm({...form,datumVon:e.target.value})}/>
          </Field>
          <Field label="Bis">
            <input type="date" value={form.datumBis} onChange={e=>setForm({...form,datumBis:e.target.value})}/>
          </Field>
        </div>
      </section>

      <section className="section">
        <h2>Einsatz</h2>
        <Field label="Fahrer">
          <input type="text" placeholder="Fahrer eintippen" value={form.fahrer} onChange={e=>setForm({...form,fahrer:e.target.value})}/>
        </Field>

        <Field label="Einsatzart">
          <select value={form.einsatzart} onChange={e=>setForm({...form,einsatzart:e.target.value})}>
            <option value="innerbetrieblich">Innerbetrieblich — € 0/h</option>
            <option value="ueberbetrieblich">Überbetrieblich — € 60/h</option>
          </select>
        </Field>
      </section>

      <section className="section">
        <h2>Betriebsstunden</h2>
        <button type="button" className="secondary" onClick={takeLastValue} disabled={loadingLast}>
          {loadingLast?"Lade letzten Wert...":"Letzten Wert übernehmen"}
        </button>

        <div className="grid two">
          <Field label="Stundenzähler Beginn">
            <input type="text" inputMode="decimal" placeholder="z. B. 1250,5" value={form.stundenStart} onChange={e=>setForm({...form,stundenStart:e.target.value})}/>
          </Field>
          <Field label="Stundenzähler Ende">
            <input type="text" inputMode="decimal" placeholder="z. B. 1253,0" value={form.stundenEnde} onChange={e=>setForm({...form,stundenEnde:e.target.value})}/>
          </Field>
        </div>

        <div className={!hasValidHours&&form.stundenStart&&form.stundenEnde?"result error":"result"}>
          <span>Gefahrene Stunden</span>
          <strong>{formatHours(gefahreneStunden)}</strong>
        </div>

        <div className="price-box">
          <span>Zu zahlender Betrag</span>
          <strong>{formatEuro(betrag)}</strong>
        </div>
      </section>

      <section className="section">
        <h2>Diesel & Bemerkung</h2>
        <Field label="Getankte Dieselmenge in Liter">
          <input type="text" inputMode="decimal" placeholder="z. B. 18,5" value={form.diesel} onChange={e=>setForm({...form,diesel:e.target.value})}/>
        </Field>
      </section>

      <section className="section">
        <Field label="Bemerkung / Schäden">
          <textarea placeholder="z. B. Schaden, Wartung, Besonderheiten" value={form.bemerkung} onChange={e=>setForm({...form,bemerkung:e.target.value})}/>
        </Field>
      </section>

      <button className="primary" type="submit" disabled={!canSave}>
        {sending?"Speichert...":"Eintrag speichern"}
      </button>
    </form>

    <footer>© by Steininger Flo</footer>
  </main></div>;
}
