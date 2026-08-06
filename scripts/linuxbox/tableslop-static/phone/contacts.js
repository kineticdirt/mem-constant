/**
 * contacts.js — Isla Primavera phone directory + scripted call graphs.
 * Plain data file: registers globalThis.PHONE_CONTACTS and nothing else, so
 * it loads identically as a browser script (classic or module) and as a Node
 * import. No logic lives here; the engine is
 * scripts/tableslop/phone-responder.js.
 *
 * Canon discipline: every topic is grounded in worldbuilding/GROUPS.md,
 * LORE-BIBLE.md, or STORIES.md. Named faces are GROUPS.md [proposal] faces;
 * Domeng "Meng" Salcedo is a new [proposal] casting (the docks run on
 * foremen per LORE-BIBLE, but no foreman had a name). All quoted facts,
 * prices, and phone numbers are [proposal]-grade static strings until the
 * GM promotes them.
 *
 * availability: { p } = per-day seeded pickup odds, or
 * { day, night, nightStart, nightEnd } for night-modulated schedules.
 * patience: mood budget; rude hits -1, creepy hits -2, zero = hangup.
 * maxExchanges: caller-turn budget before the contact wraps up (goodbye).
 */
globalThis.PHONE_CONTACTS = [
    {
      id: "r02-harbormaster",
      name: "Domeng \"Meng\" Salcedo",
      number: "555-0104",
      role: "Harbormaster, Lujara Docks",
      city: "Porto Lujara",
      hint: "dock hours — up before the cruise horns",
      availability: { p: 0.75 },
      patience: 2,
      maxExchanges: 6,
      greeting: [
        "Harbor office, Salcedo.",
        "Yeah, docks. Talk fast, the six o'clock horn's about to eat my sentence.",
        "Salcedo. If this is about a berth, the board's full till Thursday."
      ],
      voicemail: "Harbor office. If it's about a berth, call back after four. If it's about the night boats, I don't know what you're talking about. Beep.",
      topics: [
        {
          id: "night-boats",
          priority: 9,
          keywords: ["night boat", "night boats", "2 a.m.", "two a.m.", "night run", "after midnight", "marina run"],
          replies: [
            "There's a 2 a.m. run up to the Paradise marina. Not on the day manifest. You didn't get the schedule from me.",
            "I count hulls, not questions. That one comes in dark, leaves lighter. That's all the arithmetic I do."
          ],
          exhaust: ["We covered the night boats. I got a tide coming."]
        },
        {
          id: "manifests",
          priority: 8,
          keywords: ["manifest", "crate count", "crates", "cold-chain", "ifc", "cargo"],
          replies: [
            "Crates come off the IFC cold-chain at three. Count doesn't match, somebody gets paid to stop counting. Wasn't me. Wasn't gonna be me."
          ]
        },
        {
          id: "sealed-float",
          priority: 8,
          keywords: ["float", "carnaval", "parade", "sealed", "float barn"],
          replies: [
            "The sealed one behind the barn? Shrink-wrap, generator hum, no paperwork. Committee wants it to have never existed. I want it towed before CRT does its paperwork pass."
          ]
        },
        {
          id: "stevens-van",
          priority: 7,
          keywords: ["stevens", "gray van", "barcode", "cleanup van"],
          replies: [
            "Gray van, tiny barcode, parked in the service lane before anybody placed a call. I was unloading fish twenty feet off. Fish don't ask questions either."
          ]
        },
        {
          id: "work",
          priority: 5,
          keywords: ["work", "hiring", "job", "shift", "day labor"],
          replies: [
            "Show up at four with gloves and no opinions. Pays cash Fridays. You last a wet season, you get a hook with your name burned in it."
          ]
        },
        {
          id: "barrels",
          priority: 4,
          keywords: ["barrel", "barrels", "molasses"],
          replies: [
            "Everybody's uncle knows what's in the barrels. Mine says molasses and winks. Your mileage."
          ]
        },
        {
          id: "weather",
          priority: 3,
          keywords: ["weather", "tide", "rain", "storm", "wet season"],
          replies: [
            "Dry season's holding, humidity's lying about it. Swell's nothing. Anything else?"
          ]
        }
      ],
      fallback: [
        "Can't help you with that over a phone.",
        "Ask the tide. It knows as much as me and charges less.",
        "You want the chandlers for that. Down the row, blue awning."
      ],
      warning: ["Careful. Phones got two ends."],
      hangup: ["Wrong number going forward."],
      goodbye: ["Yeah. Watch the tide.", "Horns in ten. I got a dock."],
      winddown: ["Horns in ten and the manifest won't sign itself. We're done."]
    },

    {
      id: "r02-night-ledger",
      name: "Vera Lash",
      number: "555-0182",
      role: "Senior ledger clerk, Night Ledger",
      city: "Porto Lujara",
      hint: "office hours, Ledger Row",
      availability: { p: 0.65 },
      patience: 2,
      maxExchanges: 6,
      greeting: [
        "Ledger Row. You're on a recorded nothing.",
        "Vera. Make it worth a stamp."
      ],
      voicemail: "Night Ledger. State the favor and the budget, in that order. If this is about a forecast, the answer costs more than the question. Click.",
      topics: [
        {
          id: "raid-forecast",
          priority: 10,
          keywords: ["raid", "forecast", "overtime", "sweep", "tier 3", "tier three"],
          replies: [
            "Tuesday, eleven p.m., Tier 3, an alley club off the Quay. Or it was, till the forecast sold. Books went exemplary overnight. That's what a bought raid sounds like: nothing."
          ]
        },
        {
          id: "prices",
          priority: 8,
          keywords: ["price", "cost", "how much", "favor", "budget"],
          replies: [
            "A name costs forty. Who to ask about the name costs two hundred. Knowing why you asked is free — I already know."
          ]
        },
        {
          id: "carnaval-books",
          priority: 7,
          keywords: ["carnaval", "committee", "festival books"],
          replies: [
            "CRT overtime triples the week before Carnaval. It's in the spreadsheet the sergeant leaks. My books and his spreadsheet agree, which should worry both of us."
          ]
        },
        {
          id: "shell-suites",
          priority: 7,
          keywords: ["shell", "suites", "build fee", "cash"],
          replies: [
            "The float's build fee was cash from a shell that also paid three hotel suites the same week. I never write a name twice, so I'm not writing it once here."
          ]
        },
        {
          id: "who-owns",
          priority: 6,
          keywords: ["who owns", "owner", "backers", "club books", "club's books"],
          replies: [
            "Half the nightlife on this island reconciles through this office. Ownership is a column. The column is confidential. The column is also for lease."
          ]
        },
        {
          id: "guns",
          priority: 6,
          keywords: ["gun", "guns", "hardware", "piece", "nine millimeter"],
          replies: [
            "Wrong counter. I sell who sells. You want licensed, Wes Kaimi answers on the first ring. That's his whole personality."
          ]
        }
      ],
      fallback: [
        "That's not a line item.",
        "Ask narrower. Broad questions cost extra.",
        "I do arithmetic, not gossip. Gossip is table six, Paradise, lunch hours."
      ],
      warning: ["I price manners too. Yours are dropping."],
      hangup: ["..."],
      goodbye: ["Exact change. Bye."],
      winddown: ["I have a reconciliation at noon. We're done."]
    },

    {
      id: "r03-quay-rojo",
      name: "Rudy \"Slots\" Marron",
      number: "555-0147",
      role: "Quay Rojo",
      city: "Jackedsonville",
      hint: "after dark only",
      availability: { day: 0.3, night: 0.85, nightStart: 19, nightEnd: 5 },
      patience: 1,
      maxExchanges: 6,
      greeting: [
        "Yeah. You're talking to Rudy. Speak.",
        "Slots. Go."
      ],
      voicemail: "You reached Rudy. Sun's up, don't. It's about money, the number's the same as last week. It's about the Tithe, take it up with the night.",
      topics: [
        {
          id: "protection",
          priority: 9,
          keywords: ["protection", "insurance", "per-door", "weekly", "collect"],
          replies: [
            "Peace of mind, weekly, per door. You pay, nothing happens. That's the whole product: nothing, on schedule."
          ]
        },
        {
          id: "slots",
          priority: 8,
          keywords: ["slot", "slots", "red fortune", "bet", "betting", "casino", "carpet"],
          replies: [
            "Irregular betting at the Red Fortune? Themed nights draw irregular people. Carpet's mood this month is generous. Tip your dealers."
          ]
        },
        {
          id: "truce",
          priority: 8,
          keywords: ["quay nights", "truce", "neon flux", "lights", "power", "blackout", "generators"],
          replies: [
            "The truce is a light-based organism. Lights stay on, my collectors stand outside like gentlemen. Somebody cuts the power, everybody renegotiates in the dark."
          ]
        },
        {
          id: "tithe",
          priority: 7,
          keywords: ["tithe", "tribute", "kingside", "street tax", "the night owes"],
          replies: [
            "The night owes what the night owes. My ledger and their ledger disagree on the number, which is why I still shake hands downtown."
          ]
        },
        {
          id: "guns",
          priority: 5,
          keywords: ["gun", "guns", "hardware", "piece"],
          replies: [
            "You want Wes. Licensed, polite, picks up first ring. I sell the absence of problems, not the presence of hardware."
          ]
        },
        {
          id: "work",
          priority: 4,
          keywords: ["work", "crew", "job", "hiring"],
          replies: [
            "Always scouting door presence. Six-foot-something, quiet, owns a blazer. You sound like none of those."
          ]
        }
      ],
      fallback: [
        "That a question or a confession? Either way, no.",
        "Ask somebody with a quieter phone.",
        "I count chips, not favors. What do you actually want?"
      ],
      warning: ["That mouth. Once more."],
      hangup: ["We done."],
      goodbye: ["Be lucky. Don't spend it all."],
      winddown: ["Count's off somewhere. I gotta go find it."]
    },

    {
      id: "r03-rough-ride",
      name: "Wes Kaimi",
      number: "555-0177",
      role: "Founder, Rough Ride",
      city: "Jackedsonville",
      hint: "always answers — that's the product",
      availability: { p: 0.97 },
      patience: 3,
      maxExchanges: 7,
      greeting: [
        "Rough Ride, Kaimi speaking. How can I help?",
        "Wes Kaimi. Go ahead."
      ],
      voicemail: "You've reached Wes Kaimi at Rough Ride. I'm with a client. Leave a number and a window, and one of those two will be honored.",
      topics: [
        {
          id: "guns",
          priority: 10,
          keywords: ["gun", "guns", "hardware", "piece", "clean nine", "pistol", "nine"],
          replies: [
            "A clean nine runs fourteen hundred, licensed paperwork and all. Four hundred if the serial's a rumor — different conversation, different building, not this phone line."
          ]
        },
        {
          id: "contracts",
          priority: 8,
          keywords: ["protection", "contract", "detail", "armored", "guard", "bodyguard", "security"],
          replies: [
            "Armored cars, full details, event security. We invoice monthly and we're unfailingly on time. Both of those matter."
          ]
        },
        {
          id: "wiretaps",
          priority: 7,
          keywords: ["wiretap", "tapped", "listening", "surveillance", "investigation"],
          replies: [
            "Investigation services, yes. 'Wiretapped lines' is a phrase a brochure used once, apparently. I prefer 'thorough intake.'"
          ]
        },
        {
          id: "whistleblower",
          priority: 7,
          keywords: ["whistleblower", "cidance", "photos", "incident", "hotel"],
          replies: [
            "If you're holding incident photos and wondering who to trust: a lawyer, then us. Coral Trace NDAs arrive in forty-eight hours. We arrive sooner."
          ]
        },
        {
          id: "rumors",
          priority: 6,
          keywords: ["disappear", "rumors", "vacations", "gruesome", "people who move"],
          replies: [
            "People take vacations. Sometimes long ones. I've never once raised my voice about it."
          ]
        },
        {
          id: "hiring",
          priority: 4,
          keywords: ["hiring", "job", "career", "work for", "port police"],
          replies: [
            "We hire ex-port police, mostly. Calm phone voice, clean record, tips like a local. Know anyone?"
          ]
        }
      ],
      fallback: [
        "I'm afraid that's not a service we offer. What is it you actually need?",
        "Happy to help if you can be specific.",
        "Take your time. The meter on this call is mine, not yours."
      ],
      warning: ["Let's keep this courteous. It's cheaper."],
      hangup: ["I'm hanging up now. Politely."],
      goodbye: ["Stay out of incident reports."],
      winddown: ["I have a client in the other room. If it's urgent, say the word; if not, we'll pick this up tomorrow."]
    },

    {
      id: "r01-lunch-regulars",
      name: "Ines \"Nes\" Bautista",
      number: "555-0160",
      role: "Retired detective, the Lunch Regulars",
      city: "Paradise",
      hint: "lunch hours, table 6",
      availability: { p: 0.6 },
      patience: 2,
      maxExchanges: 6,
      greeting: [
        "Allegedly, this is Nes.",
        "Table six. You're interrupting a very good omelet."
      ],
      voicemail: "Nes. Buffet hours only. If it's about the notebook, it's allegedly missing and allegedly being looked for. Leave the tip with the staff.",
      topics: [
        {
          id: "notebook",
          priority: 9,
          keywords: ["notebook", "table 6", "table six", "missing", "tuesday"],
          replies: [
            "Paper notebook, decades of names, didn't come home Tuesday. Allegedly walked off. By Thursday three people asked the staff about it, which is how I know two of them can't read."
          ]
        },
        {
          id: "who-to-ask",
          priority: 8,
          keywords: ["who to ask", "information", "gossip", "trade", "ask around"],
          replies: [
            "I don't sell answers, I sell who to ask. Answers get you sued. Introductions get you coffee."
          ]
        },
        {
          id: "floor-14",
          priority: 8,
          keywords: ["cidance", "floor 14", "floor fourteen", "guest list", "44-b", "ordinance", "discretion"],
          replies: [
            "Floor fourteen and up, the county needs a warrant under 44-B. Down here the buffet's eleven ninety-five and the county needs nothing. Eat where the law can see you, I always say."
          ]
        },
        {
          id: "early-van",
          priority: 7,
          keywords: ["stevens", "van", "early", "medical", "timestamps"],
          replies: [
            "The van was in the service lane before the medical call existed. Timestamps don't lie, they just get redacted. Allegedly."
          ]
        },
        {
          id: "visibility-board",
          priority: 6,
          keywords: ["visibility board", "optics", "donors", "cameras", "the board"],
          replies: [
            "The Board manages who the viewer is, not the vice. I retail the gossip they'd rather keep wholesale. Everybody's got a niche."
          ]
        },
        {
          id: "gratitude-circle",
          priority: 6,
          keywords: ["gratitude", "circle", "sunrise", "handbill", "flyer"],
          replies: [
            "Sunrise gratitude circle, no address, hand-drawn sun. When I was on the job, free things with no address had a cover charge you paid later. Retired now. Still true."
          ]
        }
      ],
      fallback: [
        "Can't file that under anything. Allegedly.",
        "You'd be surprised what I forget. Not that, though. Just don't know it.",
        "Ask the omelet. It's heard everything I have and it's cheaper."
      ],
      warning: ["Watch it. I forget nothing."],
      hangup: ["Table's full. Lose the number."],
      goodbye: ["Tip the staff. Allegedly."],
      winddown: ["My omelet's getting cold and the boys are done being interesting."]
    },

    {
      id: "ash-list-editor",
      name: "Marco Reyes",
      number: "555-0123",
      role: "Editor, the Ash List",
      city: "Sierra Dorado (USD)",
      hint: "when the mod queue lets him",
      availability: { p: 0.55 },
      patience: 2,
      maxExchanges: 6,
      greeting: [
        "Yeah, Marco. If this is about Object 14, the answer is no.",
        "Ash List. Sources first."
      ],
      voicemail: "Marco, Ash List. Two independent artifacts, or one body photo plus a Coral Trace denial. Those are the rules. You have neither, enjoy the memes like everyone else.",
      topics: [
        {
          id: "object-14",
          priority: 9,
          keywords: ["object 14", "object fourteen", "meme", "memes"],
          replies: [
            "Half the mod queue is Object 14 traffic. It's a meme. It's three memes in a trench coat. Cite one artifact and I'll reopen the tag."
          ]
        },
        {
          id: "entry-rules",
          priority: 8,
          keywords: ["submit", "entry", "rules", "two independent", "how do i"],
          replies: [
            "Entry rule: two independent artifacts, or one body photo plus a Coral Trace denial. I cite my sources once, then I expect you to keep up."
          ]
        },
        {
          id: "coral-trace",
          priority: 8,
          keywords: ["coral trace", "cease", "nda", "lawyers", "48-hour", "forty-eight"],
          replies: [
            "One cease-and-desist so far. Their NDA machine runs a forty-eight-hour cycle and it's very patient. So are the mirrors."
          ]
        },
        {
          id: "overtime-sheet",
          priority: 7,
          keywords: ["overtime", "mercado", "spreadsheet", "crt", "wrong door", "wrong-door", "clip"],
          replies: [
            "The overtime sheet's real. Somebody at the substation leaks it and the raid calendar follows it like weather. We've got blurred wrong-door clips. Count's classified."
          ]
        },
        {
          id: "bag-photo",
          priority: 7,
          keywords: ["bag", "photo", "team 4", "team four", "casino corridor", "humidity-proof"],
          replies: [
            "Redacted photo, humidity-proof bag, Team 4 coming out of a casino corridor. Stevens wants the negative. We want a second artifact. Stalemate."
          ]
        },
        {
          id: "sonar",
          priority: 5,
          keywords: ["sonar", "east side", "dry contract", "humidity", "pdf"],
          replies: [
            "The sonar PDFs are the one folder I don't joke about. East-side humidity readings that don't match any instrument error I know. That's all I'll say on a phone."
          ]
        }
      ],
      fallback: [
        "Cool. Got an artifact, or is this a vibe?",
        "I burn out on schedule and you're early.",
        "If it's not citable, it's meme traffic. The queue is full of those."
      ],
      warning: ["Do that again and you're a moderation statistic."],
      hangup: ["Cool. Blocked."],
      goodbye: ["Keep your artifacts."],
      winddown: ["I have a methods exam and a mod queue, and one of them is on fire."]
    }
  ];
