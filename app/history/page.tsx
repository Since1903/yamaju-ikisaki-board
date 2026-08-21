const rows = [
  ['2026/08/21 08:30','山田 太郎','在席 → 外出','YKK AP','OUTLOOK'],
  ['2026/08/21 10:05','山田 太郎','外出 → 在席','本社','MANUAL'],
  ['2026/08/21 13:00','田中 次郎','在席 → 現場','○○マンション','KINTONE']
];
export default function HistoryPage(){return <main className="container"><div className="title">変更履歴</div><div className="card" style={{marginTop:16,overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['日時','社員','変更','行先','更新元'].map(h=><th key={h} style={{textAlign:'left',padding:10,borderBottom:'1px solid #ddd'}}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j} style={{padding:10,borderBottom:'1px solid #eee'}}>{v}</td>)}</tr>)}</tbody></table></div></main>}
