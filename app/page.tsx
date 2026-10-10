/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Play, ArrowUpRight } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import SponsorshipCheckout from '@/components/sponsorship-checkout';
import { useScrollReveal } from '@/lib/use-scroll-reveal';

const aboutPosts = [
  { id: '2108058524198863023', label: '01 / CAMPAIGN RESULTS', title: '350+ users joined', excerpt: 'I posted about a project yesterday with "paid partnership" tag\nand 350+ users joined with my link' },
  { id: '2084597716802232428', label: '02 / TRADING COMMUNITY', title: '$200K volume', excerpt: '> 22 users joined\n> $45k volume created through my link' },
  { id: '2059133951969759537', label: '03 / EDUCATIONAL CONTENT', title: 'Polymarket LP rewards', excerpt: '2 weeks ago I had $100 on Polymarket and no idea what LP rewards were.\nI was talking with @AmanXBT and getting some tips from bro' },
  { id: '2087400088520061328', label: '04 / CRYPTO CULTURE', title: 'Shitpost', excerpt: 'Pump fun paying $0.05 per comment\nFomo paying $0.15 per comment' },
];

type Slot = {
  id: number;
  price: number;
  position: string;
  status: 'LOADING' | 'AVAILABLE' | 'HELD' | 'PAUSED';
  startingPrice: string;
  startingPriceUnits: string;
  currentPrice: string | null;
  currentPriceUnits: string | null;
  claimPrice: string;
  claimPriceUnits: string;
  claimCount: number;
  history: string[];
  holder: { project: string; x: string } | null;
  project: string | null;
  logo: string | null;
  x?: string | null;
  checkoutInProgress: boolean;
  canClaim: boolean;
};

type Inventory = {
  slots: Slot[];
  raised: number;
  raisedDisplay: string;
  count: number;
  target: number;
  targetDisplay: string;
  threshold: number;
  thresholdDisplay: string;
  policy?: string;
  paymentsReady: boolean;
  claimsOpen: boolean;
  serverNow: number;
  auction: {
    status: 'UPCOMING' | 'LIVE' | 'CLOSED' | 'REFUNDED' | 'SUCCESSFUL';
    storedStatus: string;
    startsAt: number | null;
    endsAt: number | null;
    finalValue: string | null;
    finalHolderCount: number | null;
    finalizedAt: number | null;
  };
};

const positions = ['Front · Upper Left', 'Front · Upper Right', 'Front · Lower Left', 'Front · Lower Right', 'Back · Upper Left', 'Back · Upper Right', 'Back · Lower Left', 'Back · Lower Right'];
const initial: Slot[] = [350, 350, 300, 300, 250, 250, 200, 200].map((price, index) => ({
  id: index + 1,
  price,
  position: positions[index],
  status: 'LOADING',
  startingPrice: String(price),
  startingPriceUnits: String(price * 1_000_000),
  currentPrice: null,
  currentPriceUnits: null,
  claimPrice: String(price),
  claimPriceUnits: String(price * 1_000_000),
  claimCount: 0,
  history: [],
  holder: null,
  project: null,
  logo: null,
  checkoutInProgress: false,
  canClaim: false,
}));

const initialData: Inventory = {
  slots: initial,
  raised: 0,
  raisedDisplay: '0',
  count: 0,
  target: 2200,
  targetDisplay: '2,200',
  threshold: 1100,
  thresholdDisplay: '1,100',
  paymentsReady: false,
  claimsOpen: false,
  serverNow: 0,
  auction: { status: 'UPCOMING', storedStatus: 'UPCOMING', startsAt: null, endsAt: null, finalValue: null, finalHolderCount: null, finalizedAt: null },
};

export default function Home() {
  useScrollReveal();
  const [data, setData] = useState<Inventory>(initialData);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<Slot | null>(null);

  async function refresh() {
    try {
      const response = await fetch('/api/inventory');
      const result = await response.json() as Inventory & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Auction availability could not be loaded.');
      setData(result);
      setError('');
    } catch (caught: any) {
      setError(caught?.message || 'Auction availability could not be loaded.');
    }
  }

  useEffect(() => {
    refresh();
    const refreshTimer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const life = new AbortController();
    Promise.resolve(context.registerTool({
      name: 'view_sponsorship_slots',
      description: 'Read the current eight auction spots, holders, claim prices and campaign status.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const response = await fetch('/api/inventory');
        return response.json();
      },
    }, { signal: life.signal })).catch(() => {});
    return () => life.abort();
  }, []);

  function claim(slot: Slot) {
    if (canOpenSlot(slot)) setChosen(slot);
  }

  function canOpenSlot(slot: Slot) {
    return !['CLOSED','SUCCESSFUL','REFUNDED'].includes(data.auction.status) && ['AVAILABLE','HELD'].includes(slot.status) && !slot.checkoutInProgress;
  }

  const status=data.auction.status;
  const available = data.slots.filter(slot => slot.status === 'AVAILABLE').length;
  const loaded = data.slots[0]?.status !== 'LOADING';
  const progress = data.target ? Math.min(100, data.raised / data.target * 100) : 0;
  const auctionClosed=['CLOSED','SUCCESSFUL','REFUNDED'].includes(status);
  const holderLabel=status==='SUCCESSFUL'?'FINAL HOLDER':status==='REFUNDED'?'HELD AT CLOSE':'CURRENT HOLDER';
  const holderCountLabel=status==='SUCCESSFUL'?'final sponsors':status==='REFUNDED'?'spots at close':auctionClosed?'spots held at close':'current holders';
  const heroAction=auctionClosed?'CLAIMS CLOSED':'CLAIM A SPOT';

  return (
    <main id="top">
      <nav className="nav wrap">
        <a className="brand creator-brand" href="#top"><img className="creator-avatar" src="/web3manish-pfp.jpg" width="40" height="40" alt="Manish" /><span>Web3Manish</span></a>
        <div className="navlinks">
          <a href="#benefits">WHAT YOU GET</a>
          <a href="#why">WHY</a>
          <a href="#about">ABOUT</a>
          <a className="button primary nav-cta" href="#spots">Get a spot</a>
        </div>
      </nav>

      <section className="hero wrap centered-portrait-hero">
        <div className="shirt-stage">
          <span className="shirt-limited mono">LIMITED / 08</span>
          <div className="portrait-pair">
          {['front', 'back'].map(side => (
          <div key={side} className={`shirt-image portrait-preview ${side}`}>
            <img src={side === 'front' ? '/manish-front-cutout.png' : '/manish-back-cutout.png'} width="1024" height="1536" alt={`Manish wearing the sponsorship T-shirt, ${side} placement preview`} />
            <div className="shirt-slots">
              {data.slots.filter(slot => side === 'front' ? slot.id <= 4 : slot.id > 4).map(slot => (
                <button key={slot.id} className={`print-slot ${slot.status === 'HELD' ? 'held' : ''}`} disabled={!canOpenSlot(slot)} onClick={() => claim(slot)} aria-label={`Slot ${slot.id}, ${slot.position}, claim price $${slot.claimPrice}, ${slot.status}`}>
                  {slot.logo ? <img src={slot.logo} alt={slot.project || 'Current sponsor logo'} /> : <><span className="slot-plus">{slot.status==='HELD'?'×1.5':'+'}</span><span>SLOT {String(slot.id).padStart(2, '0')}</span><b>${slot.claimPrice}</b></>}
                  <small>{slot.status==='HELD'?'NEXT CLAIM':slot.status==='AVAILABLE'?'CLAIM PRICE':slot.status}</small>
                </button>
              ))}
            </div>
          </div>
          ))}
          </div>
        </div>
      </section>

      <section className="fund wrap">
        <div><span className="mono">{auctionClosed?'TOTAL FINAL SPONSORSHIP VALUE':'TOTAL CURRENT FUNDS'}</span><p><strong>${data.raisedDisplay}</strong><span> / ${data.targetDisplay}</span></p></div>
        <div className="fund-meter"><div className="meter-label"><span>$2,200 target</span><b>{Math.round(progress)}%</b></div><Progress value={progress} className="progress" /></div>
        <div className="sponsor-count"><strong>{data.count}<span> / 8</span></strong><span>{holderCountLabel}</span></div>
      </section>

      <section className="section wrap" id="spots">
        <div className="section-heading"><div><span className="eyebrow">EIGHT POSITIONS. FOUR DAYS.</span><h2>Choose your spot.</h2></div></div>
        <div className="auction-explainer">
          <article><span className="mono">4-DAY SPOT AUCTION</span><h3>Every spot starts at its listed price.</h3><p>Already claimed a spot? You can take it by paying 1.5 times the current price. When the timer hits zero, the current holder of each spot wins it.</p></article>
          <article className="threshold-rule"><span className="mono">THE 50% RULE</span><h3>The campaign needs to reach $1,100.</h3><p>If less than 50% of the $2,200 target is raised by the end of the auction, all confirmed current sponsorship payments are refunded in full and the fundraiser closes. At $1,100 or more, the trip goes ahead.</p></article>
        </div>
        {error && <p className="notice" role="alert">{error} <button onClick={refresh}>Try again</button></p>}
        {status==='REFUNDED' && <p className="notice">The minimum funding target wasn&apos;t reached. All confirmed sponsorship payments are being refunded.</p>}
        <div className="spot-grid auction-grid">
          {data.slots.map(slot => {
            const button=auctionClosed?'CLAIMS CLOSED':slot.checkoutInProgress?'CHECKOUT IN PROGRESS':slot.status==='PAUSED'?'SPOT PAUSED':slot.status==='LOADING'?'LOADING…':'CLAIM SPOT';
            return <article className={`spot-card ${slot.status === 'HELD' ? 'is-held ' : ''}${slot.price === 350 ? 'premium' : ''}`} key={slot.id}>
              <div className="card-top"><span className="mono">SLOT {String(slot.id).padStart(2, '0')}</span><span className={`badge ${slot.status.toLowerCase()}`}>{slot.status==='HELD'?holderLabel:slot.status}</span></div>
              <h3>{slot.position.split(' · ')[0]}<span>{slot.position.split(' · ')[1]}</span></h3>
              {slot.holder && <div className="holder-line"><span>{holderLabel} · ${slot.currentPrice}</span><strong>{slot.holder.x || slot.holder.project}</strong></div>}
              <div className="price">${auctionClosed && slot.currentPrice ? slot.currentPrice : slot.claimPrice}<span>USDC</span></div>
              <button className="button slot-button" onClick={() => claim(slot)} disabled={!canOpenSlot(slot)}>{button}</button>
            </article>;
          })}
        </div>
        <p className="grid-note"><ShieldCheck size={15} /> Crypto only. USDC on supported networks. A holder changes only after confirmation.</p>
      </section>

      <section className="section wrap onboard">
        <div className="section-heading"><div><span className="eyebrow">{auctionClosed?'THE AUCTION LINEUP':'THE CURRENT LINEUP'}</span><h2>{status==='SUCCESSFUL'?"The final sponsors.":status==='REFUNDED'?"Who held a spot at close?":"Who's holding a spot?"}</h2></div><span className="mono">{data.count} / 8 {status==='SUCCESSFUL'?'FINAL':status==='REFUNDED'?'AT CLOSE':'HOLDERS'}</span></div>
        <div className="sponsors">
          {data.slots.map(slot => {
            const held = Boolean(slot.project && slot.status === 'HELD');
            return <article key={slot.id} className={held ? '' : 'lineup-open'}>
              {held && slot.logo ? <img src={slot.logo} alt={slot.project || 'Current sponsor logo'} /> : <div className="lineup-placeholder" aria-hidden="true">{String(slot.id).padStart(2, '0')}</div>}
              <h3>{held ? slot.project : 'Your project here'}</h3>
              <span>SLOT {String(slot.id).padStart(2, '0')}{held ? ` · $${slot.currentPrice}` : ''}</span>
            </article>;
          })}
        </div>
      </section>

      <section className="section wrap deliverables-section" id="benefits">
        <div className="editorial-heading"><span className="eyebrow">WHAT YOU GET</span><h2>More than a logo on a T-shirt.</h2></div>
        <div className="deliverables">
          <article className="deliverable"><div className="deliverable-title"><span>01</span><strong>/ TWO DEVCON DAYS</strong></div><p>Your logo on my T-shirt for 2 days at Devcon: one black T-shirt and one white T-shirt.</p></article>
          <article className="deliverable"><div className="deliverable-title"><span>02</span><strong>/ 2 SHORT-FORM VIDEOS</strong></div><p>Two short-form videos featuring your project during the Devcon campaign.</p></article>
          <article className="deliverable"><div className="deliverable-title"><span>03</span><strong>/ YOUR PROJECT, EXPLAINED</strong></div><p>An appreciation post introducing your project.</p></article>
          <article className="deliverable"><div className="deliverable-title"><span>04</span><strong>/ REAL-WORLD CONTENT</strong></div><p>A collection of photos from Devcon featuring me wearing the T-shirt with your brand logo.</p></article>
        </div>
        <p className="muted small deliverables-note">The four deliverables above are the complete sponsorship package for every final holder.</p>
      </section>

      <section className="section wrap faq-section" id="faq">
        <div className="editorial-heading faq-heading"><span className="mono">FAQ</span><h2>Questions, answered.</h2></div>
        <Accordion type="single" collapsible className="faq-list">
          <AccordionItem value="deliverables" className="faq-item"><AccordionTrigger className="faq-trigger"><span className="faq-question"><span>01</span>What do I get for my sponsorship?</span></AccordionTrigger><AccordionContent className="faq-answer"><p>You get your logo on the T-shirt for 2 Devcon days, 2 short-form videos, an appreciation post introducing your project, and a collection of photos featuring your brand.</p></AccordionContent></AccordionItem>
          <AccordionItem value="capacity" className="faq-item"><AccordionTrigger className="faq-trigger"><span className="faq-question"><span>02</span>How many projects can participate?</span></AccordionTrigger><AccordionContent className="faq-answer"><p>There are only 8 positions. During the four-day auction, an existing holder can be replaced only by a confirmed payment equal to 1.5 times the current price. The holder at the deadline wins the position.</p></AccordionContent></AccordionItem>
          <AccordionItem value="payment" className="faq-item"><AccordionTrigger className="faq-trigger"><span className="faq-question"><span>03</span>How do I pay?</span></AccordionTrigger><AccordionContent className="faq-answer"><p>Crypto only. Choose Ethereum, Arbitrum, Polygon, Base or Arc at checkout. Pay in USDC. The exact token, network and amount are verified on-chain.</p></AccordionContent></AccordionItem>
          <AccordionItem value="refund" className="faq-item"><AccordionTrigger className="faq-trigger"><span className="faq-question"><span>04</span>What happens if I am outbid or the campaign doesn&apos;t raise enough?</span></AccordionTrigger><AccordionContent className="faq-answer"><p>If another project outbids you, your confirmed payment will be fully refunded. If the campaign raises less than 50% of the $2,200 target ($1,100) by the end of the auction, all confirmed current sponsorship payments will be fully refunded.</p></AccordionContent></AccordionItem>
        </Accordion>
      </section>



      <section className="section wrap why-section" id="why" aria-labelledby="why-heading">
        <div className="about-intro">
          <div><span className="eyebrow">WHY</span><h2 id="why-heading">Why buy a spot?</h2></div>
          <div className="about-copy">
            <p>A booth costs a huge amount, but a spot on my T-shirt costs very little and will be seen by the same people at the event.</p>
            <p>I&apos;ll be wearing your logo on my tee across two Devcon days, around founders, builders, creators and other people in Web3. Every conversation is another opportunity for your project to be seen in the real world.</p>
            <p><strong>And it&apos;s not just about the logo.</strong></p>
            <p>Your sponsorship also includes 2 short-form videos featuring your project, an appreciation post introducing what you&apos;re building, and photos from Devcon featuring your brand.</p>
            <p>You get physical branding and content for a fraction of what a traditional booth can cost.</p>
            <p><strong>You bring the project. I&apos;ll bring it to Devcon. Let&apos;s make it a win-win.</strong></p>
          </div>
        </div>
      </section>

      <section className="section wrap about-section" id="about" aria-labelledby="about-heading">
        <div className="about-intro">
          <div><span className="eyebrow">ABOUT</span><h2 id="about-heading">Hey, I&apos;m Manish.</h2></div>
          <div className="about-copy">
            <p>I&apos;m a <strong>Web3 content creator</strong>. I mainly create content around <strong>trading, finding early opportunities, and short-form video/UGC content.</strong></p>
            <p><strong>I&apos;m heading to Devcon Mumbai 2026. Your project can come with me.</strong></p>
          </div>
        </div>
        <div className="about-videos">
          <a className="about-video" href="https://x.com/Web3Manish/status/2071121247719796770" target="_blank" rel="noreferrer" aria-label="Watch Manish's crypto video on X">
            <div className="video-preview"><img src="/about-video-1.jpg" alt="Preview of Manish's video about how people use crypto" width="848" height="478" loading="lazy" /><span className="video-play"><Play size={22} fill="currentColor" aria-hidden="true" /></span></div>
            <div className="video-caption"><span>Crypto, explained simply.</span><span className="video-link">WATCH ON X <ArrowUpRight size={15} aria-hidden="true" /></span></div>
          </a>
          <a className="about-video" href="https://x.com/Web3Manish/status/2074717587523420449" target="_blank" rel="noreferrer" aria-label="Watch Manish's trading competition video on X">
            <div className="video-preview"><img src="/about-video-2.jpg" alt="Preview of Manish's trading competition video" width="1920" height="1080" loading="lazy" /><span className="video-play"><Play size={22} fill="currentColor" aria-hidden="true" /></span></div>
            <div className="video-caption"><span>Trading opportunities.</span><span className="video-link">WATCH ON X <ArrowUpRight size={15} aria-hidden="true" /></span></div>
          </a>
        </div>
        <h3 className="about-posts-heading">A few posts showing the content I create, the community I reach, and the results I&apos;ve helped drive</h3>
        <div className="about-posts" aria-label="Selected posts on X">
          {aboutPosts.map((post) => (
            <a key={post.id} className="about-post" href={`https://x.com/Web3Manish/status/${post.id}`} target="_blank" rel="noreferrer">
              <span className="post-category mono">{post.label}</span>
              <h3>{post.title}</h3>
              <div className={`post-preview${post.id === '2084597716802232428' ? ' with-proof' : ''}`}><p>{post.excerpt}</p>{post.id === '2084597716802232428' && <img className="post-proof" src="/perps-referral-results.png" alt="Perps referral results: 25 sign-ups and $201,941.75 volume" width="967" height="286" loading="lazy" />}</div>
              <span className="video-link">READ ON X <ArrowUpRight size={15} aria-hidden="true" /></span>
            </a>
          ))}
        </div>
      </section>



      <footer className="wrap"><div className="footer-contact">DMs open: <a href="https://t.me/manishweb3" target="_blank" rel="noreferrer">Manish</a></div><div className="footer-legal"><a href="/terms">Terms</a><a href="/content-logo-policy">Content &amp; Logo Policy</a></div><a className="admin-link" href="/admin">Admin</a></footer>

      <SponsorshipCheckout
        open={Boolean(chosen)}
        slot={chosen}
        paymentsReady={data.paymentsReady}
        claimsOpen={data.claimsOpen}
        onOpenChange={(next) => { if (!next) { setChosen(null); refresh(); } }}
        onConfirmed={refresh}
      />
    </main>
  );
}
