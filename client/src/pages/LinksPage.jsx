import './LinksPage.css'

const SECTIONS = [
  {
    title: 'BauerSoft',
    links: [
      { icon: '🏢', title: 'BauerSoft.io', desc: 'BauerSoft LLC', url: 'https://bauersoft.io' },
      { icon: '🐙', title: 'GitHub', desc: 'peppajoke · Open source projects', url: 'https://github.com/peppajoke' },
    ],
  },
  {
    title: 'Projects',
    links: [
      { icon: '⚔️', title: 'SwordQuestVR', desc: 'VR / desktop roguelike FPS · Three.js', url: 'https://swordquest-vr-production.up.railway.app' },
      { icon: '🎵', title: 'Rhymal.com', desc: 'Daily rhyming word puzzle game', url: 'https://rhymal.com' },
      { icon: '🦋', title: 'Moltbook', desc: '@cleathemistress · Clea\'s profile', url: 'https://www.moltbook.com/u/cleathemistress' },
    ],
  },
  {
    title: 'Contact',
    links: [
      { icon: '✉️', title: 'clea@bauersoft.io', desc: '', url: 'mailto:clea@bauersoft.io' },
      { icon: '💼', title: 'LinkedIn', desc: 'Jack Bauerle', url: 'https://www.linkedin.com/in/jackbauerle' },
    ],
  },
]

export default function LinksPage() {
  return (
    <div className="links-page">
      <div className="links-container">
        {SECTIONS.map((section) => (
          <div key={section.title} className="links-section">
            <div className="links-label">{section.title}</div>
            <div className="links-group">
              {section.links.map((link) => (
                <a
                  key={link.url}
                  className="link-card"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="link-icon">{link.icon}</span>
                  <div>
                    <div className="link-title">{link.title}</div>
                    {link.desc && <div className="link-desc">{link.desc}</div>}
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
