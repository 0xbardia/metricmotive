const s=require(process.argv[2]);
console.log("runs:", s.meta.map(m=>m.label[0]+m.run+(m.ok?"":"FAIL")+"@"+m.loadBefore).join(" "));
for (const page of Object.keys(s.summary)) for (const lab of [s.A.label,s.B.label]) { const r=s.summary[page][lab];
  console.log(page.padEnd(8), lab.padEnd(9), "n="+r.n, "TBT",r.tbt.median,"["+r.tbt.range+"]","rank1",r.rank[0].median,"["+r.rank[0].range+"]","over33",r.scrollOver33.median,"["+r.scrollOver33.range+"]","p95",r.scrollP95.median,"["+r.scrollP95.range+"]","CLS",r.cls.median); }
