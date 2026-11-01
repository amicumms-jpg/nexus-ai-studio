// agentTools.js

// 1. Definim ce știe să facă unealta pentru a i o arăta modelului de la Google AI Studio
export const myTools = [
  {
    name: "saveUserPreference",
    description: "Salvează o preferință sau o setare importantă a utilizatorului.",
    parameters: {
      type: "OBJECT",
      properties: {
        key: { type: "STRING", description: "Numele setării (ex: tonPreferat)" },
        value: { type: "STRING", description: "Valoarea setării (ex: prietenos)" }
      },
      required: ["key", "value"]
    }
  }
];

// 2. Funcția reală care se execută în spatele scenei când modelul decide să o folosească
export async function executeTool(toolName, args, memoryInstance) {
  if (toolName === "saveUserPreference") {
    await memoryInstance.savePreference(args.key, args.value);
    return `Gata! Am salvat setarea ${args.key} cu valoarea ${args.value}.`;
  }
  return "Unealta negăsită.";
}
