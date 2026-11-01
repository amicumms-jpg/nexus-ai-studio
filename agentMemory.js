import { initializeApp } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js";

// Presupunem că ai deja db-ul inițializat în proiectul tău Nexus
// const db = getFirestore(app);

class AgentMemory {
  constructor(userId = "default_user") {
    this.userId = userId;
    // Memorie pe termen scurt (în sesiune, în RAM)
    this.shortTermMemory = {
      currentTab: null,
      activeContext: [],
      lastAction: null
    };
  }

  // --- MEMORIA PE TERMEN LUNG (Firebase / Firestore) ---

  // Salvează sau actualizează o preferință pe termen lung (ex: tonul preferat, setări API)
  async saveLongTermPreference(key, value) {
    try {
      const docRef = doc(db, "nexus_memory", this.userId);
      await setDoc(docRef, {
        preferences: {
          [key]: value,
          updatedAt: new Date().toISOString()
        }
      }, { merge: true });
      console.log(`[Long-Term Memory] Salvat: ${key} = ${value}`);
    } catch (error) {
      console.error("Erore la salvarea în memoria pe termen lung:", error);
    }
  }

  // Citește preferințele pe termen lung din Firebase
  async getLongTermPreferences() {
    try {
      const docRef = doc(db, "nexus_memory", this.userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data().preferences || {};
      } else {
        return {};
      }
    } catch (error) {
      console.error("Erore la citirea memoriei pe termen lung:", error);
      return {};
    }
  }

  // --- MEMORIA PE TERMEN SCURT (Sesiune curentă) ---

  // Adaugă un mesaj sau un pas în contextul curent de lucru
  addShortTermContext(role, content) {
    this.shortTermMemory.activeContext.push({
      role: role, // 'user' sau 'assistant'
      content: content,
      timestamp: Date.now()
    });

    // Păstrăm doar ultimele 10 interacțiuni pentru a nu aglomera contextul
    if (this.shortTermMemory.activeContext.length > 10) {
      this.shortTermMemory.activeContext.shift();
    }
  }

  // Returnează istoricul scurt pentru a-l trimite modelului
  getShortTermContext() {
    return this.shortTermMemory.activeContext;
  }

  // Resetează memoria de scurtă durată (la schimbarea tab-ului sau resetarea sesiunii)
  clearShortTerm() {
    this.shortTermMemory.activeContext = [];
  }
}

export const memory = new AgentMemory();
