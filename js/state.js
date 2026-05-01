// state.js — Varsayılan listeler ve uygulama state objesi

export const DURUM = ["Beklemede", "Devam Ediyor", "Tamamlandı"];

export const DEF_S = [
  "Noyanlar Bellagio","Ceasar Arıtma","Vista Mare","İskele- Grand Sapphire",
  "GSR - F Blok","Noyanlar - Ocean Life","Tuzla Seda Gültekin",
  "The Blue Residance","NothernLand Code","Pegas Bafra","Bafra Kaya","Koral Bey Evi",
];

export const DEF_P = [
  "MD SHOHAG ALİ","MS KAMRUL HASAN","MD SHOHIDUL ISLAM","REZAUL HOQUE",
  "MD MUDERSARUL HAQUA","MD SHAHİD MİA","İMAM HOSEN","MD SHOHAN ALİ",
  "MD.RAHAMOT ALİ","MD.JAHANGİR ALAM","RASEL AHMAD","RABIUL KAJİ",
  "HİRENDRA CHANDRA MANDAL","İMAD ALİ","HAMİD ALİ","TAYYAB AHMAD",
  "KAİUM KHANDOKAR","SHAFAYT MIA","FARHAD KHAN","ABDUR REHMAN",
  "MOHAMMED JAKER ULLAH","MD. RIFAT AHAMED","MD.MOSHARRAF HOSSAİN",
  "MD. SHİPON ALİ","MD. JUEL RANA","MD. SHAMİM ALİ","MD.SHUFİL UDDİN",
  "MD BASİRUL HAQUE","MD SOHAN ALİ","AMRAN AMRAN","MD AMİT HASAN",
  "MD SOHAG HOWLADER","MD MİLON","ABU NASHIM SEZAN","NAZMUL HOSSAİN",
  "BİPLAB BİPLAB","TUHİN ALİ","NAYON HOSSAİN","MD ASİM HOSSAİN",
];

export const DEF_M = [
  "KÖSTER TPO Aqua U15","KÖSTER NB Sistem","KÖSTER NB 2000",
  "KÖSTER NB Super Elastik BEYAZ","KÖSTER NB Elastik 2K","KÖSTER Yıldırım Tozu",
  "KÖSTER Wasserstop","KÖSTER NB Super","KÖSTER Polysil TG 500",
  "KÖSTER Polyflex 2K","KÖSTER KBE Flüssigfolie","KÖSTER KB-Pur 214",
  "KÖSTER KB-Pur 560","KÖSTER Metal Primer","KÖSTER PVC Primer","KÖSTER BD 50",
  "KÖSTER Repamor","KÖSTER BDM / BDM Powder","KÖSTER Latex","KÖSTER VGM 5",
  "KÖSTER EP Mortar","KÖSTER KB-Pox 002","KÖSTER AC 46","KÖSTER PU-Flex 25",
  "KÖSTER PU Primer 110","KÖSTER PU Primer 120","KÖSTER Flex Band","KÖSTER KB-Fix",
  "KÖSTER Fugenspachtel FS-H","KÖSTER Fugenspachtel FS-V",
  "KÖSTER Fugenspachtel FS-Pox Primer 2K","KÖSTER Quellband 2520",
  "KÖSTER Super Fleece","KÖSTER KB-Pur IN 7","KÖSTER KB-Pox IN",
  "KÖSTER KB-Pur GEL","Keçe",
];

export const app = {
  bolge: null,
  santiyeler: [...DEF_S],
  personeller: [...DEF_P],
  malzemeler: [...DEF_M],
  kayitlar: [],
  logSatirlar: [],
  notlar: {},
  havaDurumu: {},
  secilenSantiye: null,
  duzenlenenId: null,
  form: null,
  aktifView: "projects",
  filtre: { santiyeAra: "", alanAra: "", alanDurum: "" },
};
