      // Clothing CHANGE beats must overwrite, not fill-blank. Kit has to track as it
      // happens; freezing on first establishment is why outfits went stale mid-scene.
      const changeM = window.match(
        /\b(?:changes?\s+into|changed\s+into|pulls?\s+on|pulled\s+on|puts?\s+on|put\s+on|slips?\s+into|slipped\s+into|swaps?\s+(?:into|to)|dresses?\s+in|now\s+wearing|tugs?\s+on|shrugs?\s+into|steps?\s+into|buttons?\s+(?:up\s+)?(?:into|on)|zips?\s+(?:up\s+)?(?:into|on)|changes?\s+out\s+of[^.!?\n]{0,30}?\s+into)\s+(?:a\s|an\s|the\s|her\s|his\s|their\s)?([^.!?\n]{4,90})/i
      );
      const prevOutfit = String(row.current_outfit || "").trim();
      if (changeM) {
        patch.current_outfit = String(changeM[1] || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160);
      } else if (wearM && !prevOutfit) {
        patch.current_outfit = String(wearM[1] || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160);
      }
      // Worn armor / equipped weapons are kit, not prose flavour — mirror them into
      // inventory so the sheet and the next turn's inject both see them.
      const gearAdds = [];
      const gearRe =
        /\b(?:equips?|equipped|straps?\s+on|slings?|slung|holsters?|sheathes?|shoulders?|dons?|buckles?\s+on|straps?\s+(?:it\s+)?across)\s+(?:a\s|an\s|the\s|her\s|his\s|their\s)?([A-Za-z][A-Za-z0-9 \-']{2,48})/gi;
      let gm;
      while ((gm = gearRe.exec(window))) {
        const gname = String(gm[1] || "")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/\s+(?:and|then|before|after|while|as)$/i, "");
        if (gname.length < 3) continue;
        const slot = /sword|knife|blade|gun|pistol|rifle|shotgun|bat|axe|machete|crowbar|weapon|revolver/i.test(
          gname
        )
          ? "weapon"
          : /vest|armor|armour|plate|helmet|pads|guard|jacket|kevlar/i.test(gname)
            ? "armor"
            : "gear";
        gearAdds.push({ name: gname.slice(0, 60), qty: 1, slot: slot });
        if (gearAdds.length >= 4) break;
      }
      if (gearAdds.length) {
        patch.inventory = mergeInventoryLists(row.inventory, gearAdds);
      }
