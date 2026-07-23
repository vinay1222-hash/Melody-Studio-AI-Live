import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { Member, Song, Performance, EventStats } from "./src/types";
import { initialMembers, initialSongs, initialPerformances, past19Events, getMatchingSuggestions } from "./src/mockData";

// Set up server state
let members: Member[] = [...initialMembers];
let songs: Song[] = [...initialSongs];
let performances: Performance[] = [...initialPerformances];
let events: EventStats[] = [...past19Events];

// Helper to generate a unique ID
function generateId(prefix: string, list: { id: string }[]): string {
  const ids = list.map(item => {
    const numPart = item.id.replace(prefix, "").replace("-", "");
    return parseInt(numPart, 10);
  }).filter(num => !isNaN(num));
  
  const max = ids.length > 0 ? Math.max(...ids) : 0;
  const next = max + 1;
  if (prefix === "M") {
    return `M-${String(next).padStart(2, "0")}`;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// Lazy Gemini Initialization
let aiClient: any = null;
function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "MY_GEMINI_API_KEY" || key === "") {
      return null;
    }
    try {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    } catch (e) {
      console.error("Failed to initialize Gemini Client:", e);
      return null;
    }
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "20mb" }));

  // --- API Routes ---

  // Get current system state
  app.get("/api/state", (req, res) => {
    res.json({ members, songs, performances, events });
  });

  // Sync client-side local state back to the server
  app.post("/api/state/sync", (req, res) => {
    const { members: clientMembers, songs: clientSongs, performances: clientPerformances, events: clientEvents } = req.body;
    if (clientMembers && Array.isArray(clientMembers)) {
      members = clientMembers;
    }
    if (clientSongs && Array.isArray(clientSongs)) {
      songs = clientSongs;
    }
    if (clientPerformances && Array.isArray(clientPerformances)) {
      performances = clientPerformances;
    }
    if (clientEvents && Array.isArray(clientEvents)) {
      events = clientEvents;
    }
    res.json({ success: true, message: "State synced from local storage." });
  });

  // Reset state to initial mock data
  app.post("/api/state/reset", (req, res) => {
    members = [...initialMembers];
    songs = [...initialSongs];
    performances = [...initialPerformances];
    events = [...past19Events];
    res.json({ success: true, message: "State reset to default mock values." });
  });

  // Get events list
  app.get("/api/events", (req, res) => {
    res.json(events);
  });

  // Create a new event
  app.post("/api/events", (req, res) => {
    const { eventName, place, date, startTime, finishTime, hrsTaken, singersParticipated, guest, songsAllotted, completed, youtubeViews, subscribers, status } = req.body;
    
    const nextNum = events.length > 0 ? Math.max(...events.map(ev => Number(ev.eventNumber) || 0)) + 1 : 1;
    const newEvent: EventStats = {
      eventNumber: nextNum,
      eventId: `E-${String(nextNum).padStart(2, "0")}`,
      eventName: eventName || `${nextNum}nd Event: New Special Gathering`,
      date: date || new Date().toISOString().split("T")[0],
      venue: place || "Sangeet Bhavan Dharwad",
      startTime: startTime || "05:00 PM",
      endTime: finishTime || "08:00 PM",
      duration: hrsTaken || "3.0",
      singersCount: singersParticipated !== undefined ? Number(singersParticipated) : 0,
      guestCount: guest || null,
      songsAllotted: songsAllotted !== undefined ? Number(songsAllotted) : 30,
      songsCompleted: completed !== undefined ? Number(completed) : 0,
      youtubeViews: youtubeViews !== undefined && youtubeViews !== null ? Number(youtubeViews) : null,
      subscribers: subscribers !== undefined && subscribers !== null ? Number(subscribers) : null,
      status: (status as any) || "Upcoming",

      // backward compatibility fields
      place: place || "Sangeet Bhavan Dharwad",
      finishTime: finishTime || "08:00 PM",
      hrsTaken: hrsTaken || "3.0",
      singersParticipated: singersParticipated !== undefined ? Number(singersParticipated) : 0,
      guest: guest || null,
      completed: completed !== undefined ? Number(completed) : 0,
    };

    events.push(newEvent);
    res.status(201).json(newEvent);
  });

  // Create a new member
  app.post("/api/members", (req, res) => {
    const { name, email, joinedDate, photoUrl, youtubeViews, gender, category, phoneNumber, place, badgesIssued, remarks, attendance } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }
    const newMember: Member = {
      id: generateId("M", members),
      memberId: `M-${String(members.length + 1).padStart(2, "0")}`,
      name,
      gender: gender || "Male",
      category: category || "Active Member",
      phone: phoneNumber || "+91 9845" + Math.floor(100000 + Math.random() * 900000),
      location: place || "Dharwad",
      badges: badgesIssued || "Bronze Star",
      attendance: attendance || {},

      // backward compatibility fields
      email: email || `${name.toLowerCase().replace(/\s+/g, ".")}@melody.ai`,
      joinedDate: joinedDate || new Date().toISOString().split("T")[0],
      photoUrl: photoUrl || undefined,
      youtubeViews: youtubeViews !== undefined ? Number(youtubeViews) : Math.floor(Math.random() * 50000) + 10000,
      place: place || "Dharwad",
      phoneNumber: phoneNumber || "+91 9845" + Math.floor(100000 + Math.random() * 900000),
      badgesIssued: badgesIssued || "Bronze Star",
      remarks: remarks || "Active participant"
    };
    members.push(newMember);
    res.status(201).json(newMember);
  });

  // Create a new song
  app.post("/api/songs", (req, res) => {
    const { title, artist, genre } = req.body;
    if (!title || !artist) {
      return res.status(400).json({ error: "Title and Artist are required" });
    }
    const newSong: Song = {
      id: generateId("S", songs),
      title,
      artist,
      genre: genre || "Pop"
    };
    songs.push(newSong);
    res.status(201).json(newSong);
  });

  // Create a new performance log
  app.post("/api/performances", (req, res) => {
    const { songId, singers, eventName, eventDate } = req.body;
    if (!songId || !singers || !Array.isArray(singers)) {
      return res.status(400).json({ error: "songId and singers list are required" });
    }
    const perfId = `P${String(performances.length + 1).padStart(4, "0")}`;
    const singerList = singers.map((s: any) => ({
      name: s.name,
      memberId: s.memberId || null
    }));

    const type = singerList.length === 1 ? "Solo" : singerList.length === 2 ? "Duet" : "Group";

    const firstSinger = singerList[0]?.name || "Guest";
    const secondSinger = singerList[1]?.name || null;
    const firstMemberId = singerList[0]?.memberId || null;
    const secondMemberId = singerList[1]?.memberId || null;
    const songObj = songs.find(s => s.id === songId);
    const songTitle = songObj?.title || "Unknown Title";

    const eventNum = parseInt(eventName?.match(/\d+/)?.[0] || "21", 10);
    const newPerformance: Performance = {
      id: perfId,
      songId,
      singers: singerList,
      eventName: eventName || "General Event",
      eventDate: eventDate || new Date().toISOString().split("T")[0],
      type,

      // exact mappings
      singer1: firstSinger,
      singer2: secondSinger,
      performanceType: type === "Solo" ? "Solo" : "Duet",
      songTitle,
      duration: "5:20",
      eventNumber: eventNum,
      date: eventDate || new Date().toISOString().split("T")[0],
      venue: "Sangeet Bhavan Dharwad",

      firstMemberId,
      secondMemberId,
      eventId: `E-${String(eventNum).padStart(2, "0")}`,

      // backward compatibility fields
      firstSinger,
      secondSinger,
    };

    performances.push(newPerformance);
    res.status(201).json(newPerformance);
  });

  // Reconcile a specific unmatched singer name to a clean member ID
  app.post("/api/reconcile-item", (req, res) => {
    const { singerName, memberId } = req.body;
    if (!singerName || !memberId) {
      return res.status(400).json({ error: "singerName and memberId are required" });
    }

    // Verify member exists
    const memberExists = members.some(m => m.id === memberId);
    if (!memberExists) {
      return res.status(404).json({ error: `Member with ID ${memberId} not found` });
    }

    let updatedCount = 0;
    // Map over all performances and update matching singer name entries
    performances = performances.map(perf => {
      let changed = false;
      const updatedSingers = perf.singers.map(sing => {
        if (sing.name.toLowerCase().trim() === singerName.toLowerCase().trim() && sing.memberId !== memberId) {
          changed = true;
          updatedCount++;
          return { ...sing, memberId };
        }
        return sing;
      });
      return changed ? { ...perf, singers: updatedSingers } : perf;
    });

    res.json({ success: true, updatedCount, singerName, memberId });
  });

  // AI-assisted (Gemini) or Levenshtein matching suggestions
  app.post("/api/gemini/suggest", async (req, res) => {
    const { singerName } = req.body;
    if (!singerName) {
      return res.status(400).json({ error: "singerName is required" });
    }

    const ai = getGeminiClient();
    if (!ai) {
      // Fallback directly to Levenshtein distance matching if Gemini is not set up
      const localSuggestions = getMatchingSuggestions(singerName, members);
      return res.json({
        engine: "Levenshtein Engine (Local Fallback)",
        suggestions: localSuggestions
      });
    }

    try {
      const simplifiedMembers = members.map(m => ({ id: m.id, name: m.name }));
      const prompt = `You are the Melody AI Pro Reconciliation bot.
      We have an unmatched singer name from a legacy performance sheet: "${singerName}".
      Here is the registered roster of members:
      ${JSON.stringify(simplifiedMembers, null, 2)}

      Tasks:
      Find the top 3 best matching members from the roster.
      For each match, provide:
      - memberId
      - name
      - confidence (integer from 0 to 100 representing how likely they are the same person based on spelling/initials)
      - reason (concise reasoning, e.g. "Exact match", "Phonetic variation", "First name and last initial match")

      Response requirements:
      Return ONLY a raw JSON array of objects. Do NOT use markdown code blocks, do NOT write backticks (like \`\`\`json), and do NOT add explanatory text.
      Example structure:
      [
        {"memberId": "M001", "name": "Vinayak Nadigir", "confidence": 95, "reason": "First name matching with spelling variation"}
      ]`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt
      });

      const responseText = response.text || "[]";
      // Clean up potential markdown formatting if returned anyway
      const cleanedText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const aiSuggestions = JSON.parse(cleanedText);

      return res.json({
        engine: "Gemini AI Engine",
        suggestions: aiSuggestions
      });

    } catch (e: any) {
      console.error("Gemini suggestion failed, reverting to Levenshtein:", e);
      const localSuggestions = getMatchingSuggestions(singerName, members);
      return res.json({
        engine: "Levenshtein Engine (Error Fallback)",
        suggestions: localSuggestions
      });
    }
  });

  // Batch Ingestion from Excel Log (Accepts parsed performances from client-side spreadsheet upload)
  app.post("/api/upload-log", (req, res) => {
    const { performances: importedPerformances, songs: importedSongs } = req.body;

    if (!importedPerformances || !Array.isArray(importedPerformances)) {
      return res.status(400).json({ error: "Valid performances list is required" });
    }

    let songsAdded = 0;
    let performancesAdded = 0;

    // First process songs
    if (importedSongs && Array.isArray(importedSongs)) {
      importedSongs.forEach((s: any) => {
        const songExists = songs.some(existingSong => 
          existingSong.title.toLowerCase().trim() === s.title.toLowerCase().trim() &&
          existingSong.artist.toLowerCase().trim() === s.artist.toLowerCase().trim()
        );
        if (!songExists) {
          const newSong: Song = {
            id: generateId("S", songs),
            title: s.title,
            artist: s.artist,
            genre: s.genre || "Pop"
          };
          songs.push(newSong);
          songsAdded++;
        }
      });
    }

    // Now process performances
    importedPerformances.forEach((p: any) => {
      // Find or match song id
      let resolvedSongId = "";
      const matchSong = songs.find(s => 
        s.title.toLowerCase().trim() === p.songTitle.toLowerCase().trim() &&
        s.artist.toLowerCase().trim() === p.songArtist.toLowerCase().trim()
      );

      if (matchSong) {
        resolvedSongId = matchSong.id;
      } else {
        // Create song on the fly
        const newSong: Song = {
          id: generateId("S", songs),
          title: p.songTitle,
          artist: p.songArtist || "Unknown Artist",
          genre: p.genre || "Pop"
        };
        songs.push(newSong);
        resolvedSongId = newSong.id;
        songsAdded++;
      }

      // Check singers
      const singerList = p.singers.map((sName: string) => {
        const cleanedName = sName.trim();
        // Exact case-insensitive match on clean roster to auto-map ID if perfect match
        const perfectMatch = members.find(m => m.name.toLowerCase().trim() === cleanedName.toLowerCase());
        return {
          name: cleanedName,
          memberId: perfectMatch ? perfectMatch.id : null // will trigger Guest Performance Reconciliation Queue if unmatched!
        };
      });

      const type = singerList.length === 1 ? "Solo" : singerList.length === 2 ? "Duet" : "Group";
      const perfId = `P${String(performances.length + 1).padStart(4, "0")}`;

      const firstSinger = singerList[0]?.name || "Guest";
      const secondSinger = singerList[1]?.name || null;
      const firstMemberId = singerList[0]?.memberId || null;
      const secondMemberId = singerList[1]?.memberId || null;
      const songTitle = p.songTitle || "Unknown Song";

      const eventNum = parseInt(p.eventName?.match(/\d+/)?.[0] || "21", 10);
      const newPerformance: Performance = {
        id: perfId,
        songId: resolvedSongId,
        singers: singerList,
        eventName: p.eventName || "Excel Ingested Event",
        eventDate: p.eventDate || new Date().toISOString().split("T")[0],
        type,

        // exact mappings
        singer1: firstSinger,
        singer2: secondSinger,
        performanceType: type === "Solo" ? "Solo" : "Duet",
        songTitle,
        duration: "5:20",
        eventNumber: eventNum,
        date: p.eventDate || new Date().toISOString().split("T")[0],
        venue: "Sangeet Bhavan Dharwad",

        firstMemberId,
        secondMemberId,
        eventId: `E-${String(eventNum).padStart(2, "0")}`,

        // backward compatibility fields
        firstSinger,
        secondSinger,
      };

      performances.push(newPerformance);
      performancesAdded++;
    });

    res.json({
      success: true,
      performancesAdded,
      songsAdded,
      totalSongsCount: songs.length,
      totalPerformancesCount: performances.length
    });
  });

  // --- Vite Dev & Production Client Delivery Middleware ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Melody AI Pro Server] listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
