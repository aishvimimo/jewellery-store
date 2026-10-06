import { useState } from 'react';
import { promotions as p, money } from '@store/contracts';
import { Pause, Play } from 'lucide-react';
export default function Offers(){
  const [paused,setPaused]=useState(false);
  const offers=[`Festive Sale · Extra ${money(p.festiveDiscountPaise)} off merchandise from ${money(p.festiveThresholdPaise)} with FESTIVE225`,`Extra ${p.prepaidDiscountBps/100}% off eligible prepaid orders`,`WELCOME10 · ${p.welcomeDiscountBps/100}% off merchandise · cannot combine with prepaid offer`];
  return <div className="offer-strip"><div className="offer-track" style={{animationPlayState:paused?'paused':undefined}}>{[...offers,...offers].map((text,i)=><span key={i} aria-hidden={i>=offers.length?true:undefined}>{text}</span>)}</div><button className="offer-pause" onClick={()=>setPaused(!paused)} aria-label={paused?'Resume moving offers':'Pause moving offers'} aria-pressed={paused}>{paused?<Play size={14}/>:<Pause size={14}/>}</button></div>;
}
