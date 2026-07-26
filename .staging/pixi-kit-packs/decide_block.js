  function buildDecisionCommitBlock() {
    // NPCs kept bouncing the player's question back as another question. Characters
    // with their own goals decide and act; the player is not a help desk.
    return [
      "[Decide — do not interview the player]",
      "Characters make decisions. When the player poses a choice, asks what someone wants, or gives a direction, the character in scene **picks and acts on it** in the same reply. Show the decision landing: the choice made, the thing done, the consequence starting.",
      "Do not end a reply with a question back to the player unless the player's **quoted** speech asked a direct question of that character, and even then answer first and ask second.",
      "Never stack options for the player to pick from, never present a menu, never ask for clarification on logistics you can decide yourself. Pick the reading that fits the character's goals and commit; if you guessed wrong the player will correct you next turn.",
      "Characters may refuse, argue, or choose against the player — that is a decision too. What is not allowed is stalling: no 'what do you want me to do?', no 'should I...?', no waiting for permission that the scene does not require.",
      "Unquoted player text is authorial direction or a request for description, not dialogue aimed at a character. Answer it in narration; nobody in the scene turns to ask the player about it.",
    ].join("\n");
  }
