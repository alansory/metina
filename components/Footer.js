import React from 'react';

const profileLinks = [
  {
    name: 'Yanman',
    handle: '0xyanman',
    url: 'https://x.com/0xyanman',
    icon: '/img/profile.png',
  },
  {
    name: 'Metina',
    handle: 'MetinaID',
    url: 'https://x.com/MetinaID',
    icon: '/img/x.png',
  },
  {
    name: 'Discord',
    handle: 'Discord',
    url: 'https://discord.gg/uHr8UvkqRN',
    icon: '/img/discord.webp',
  }
];

const Footer = () => {
  return (
    <footer className="fixed bottom-0 inset-x-0 border-t border-gray-800 bg-black/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-3 py-3 flex justify-center">
        <div className="flex items-center gap-4 px-3 py-1.5 rounded-full border border-gray-800 bg-gray-900/60">
          {profileLinks.map((profile) => (
            <a
              key={profile.name}
              href={profile.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-gray-300 hover:text-white transition"
              aria-label={`Open ${profile.name}`}
            >
              <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center bg-gray-800">
                <img
                  src={profile.icon}
                  alt={`${profile.name} icon`}
                  className="w-full h-full object-cover"
                />
              </div>

              <span className="font-medium">{profile.name}</span>
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
