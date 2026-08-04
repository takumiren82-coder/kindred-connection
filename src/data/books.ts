export type Book = {
  id: string;
  title: string;
  author: string;
  gutenberg_id: number;
  category: "Fiction" | "Adventure" | "Mystery" | "Romance";
  description: string;
  cover_url: string;
};

const cover = (id: number) =>
  `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`;

export const books: Book[] = [
  { id: "1342", title: "Pride and Prejudice", author: "Jane Austen", gutenberg_id: 1342, category: "Romance", description: "The tale of Elizabeth Bennet and Mr. Darcy — wit, pride, and love in Regency England.", cover_url: cover(1342) },
  { id: "2701", title: "Moby Dick", author: "Herman Melville", gutenberg_id: 2701, category: "Adventure", description: "Captain Ahab's obsessive hunt for the great white whale.", cover_url: cover(2701) },
  { id: "1513", title: "Romeo and Juliet", author: "William Shakespeare", gutenberg_id: 1513, category: "Romance", description: "Two star-crossed lovers in fair Verona.", cover_url: cover(1513) },
  { id: "84", title: "Frankenstein", author: "Mary Shelley", gutenberg_id: 84, category: "Fiction", description: "A scientist's creation turns against him — a gothic classic.", cover_url: cover(84) },
  { id: "11", title: "Alice in Wonderland", author: "Lewis Carroll", gutenberg_id: 11, category: "Adventure", description: "Down the rabbit hole into a world of wonder.", cover_url: cover(11) },
  { id: "1400", title: "Great Expectations", author: "Charles Dickens", gutenberg_id: 1400, category: "Fiction", description: "Pip's journey from poor orphan to gentleman.", cover_url: cover(1400) },
  { id: "1661", title: "The Adventures of Sherlock Holmes", author: "Arthur Conan Doyle", gutenberg_id: 1661, category: "Mystery", description: "Twelve iconic cases of the world's greatest detective.", cover_url: cover(1661) },
  { id: "174", title: "The Picture of Dorian Gray", author: "Oscar Wilde", gutenberg_id: 174, category: "Fiction", description: "A portrait ages while its owner stays forever young.", cover_url: cover(174) },
  { id: "76", title: "Adventures of Huckleberry Finn", author: "Mark Twain", gutenberg_id: 76, category: "Adventure", description: "Huck and Jim raft down the Mississippi.", cover_url: cover(76) },
  { id: "98", title: "A Tale of Two Cities", author: "Charles Dickens", gutenberg_id: 98, category: "Fiction", description: "Love and sacrifice during the French Revolution.", cover_url: cover(98) },
  { id: "345", title: "Dracula", author: "Bram Stoker", gutenberg_id: 345, category: "Mystery", description: "The original vampire novel — chilling gothic horror.", cover_url: cover(345) },
  { id: "1260", title: "Jane Eyre", author: "Charlotte Brontë", gutenberg_id: 1260, category: "Romance", description: "A governess falls for her brooding employer.", cover_url: cover(1260) },
  { id: "768", title: "Wuthering Heights", author: "Emily Brontë", gutenberg_id: 768, category: "Romance", description: "The tempestuous love of Heathcliff and Catherine.", cover_url: cover(768) },
  { id: "1727", title: "The Odyssey", author: "Homer", gutenberg_id: 1727, category: "Adventure", description: "Odysseus's ten-year voyage home from Troy.", cover_url: cover(1727) },
  { id: "1787", title: "Hamlet", author: "William Shakespeare", gutenberg_id: 1787, category: "Fiction", description: "The Prince of Denmark seeks revenge for his father's murder.", cover_url: cover(1787) },
  { id: "120", title: "Treasure Island", author: "Robert Louis Stevenson", gutenberg_id: 120, category: "Adventure", description: "Pirates, buried gold, and Long John Silver.", cover_url: cover(120) },
  { id: "583", title: "The Swiss Family Robinson", author: "Johann David Wyss", gutenberg_id: 583, category: "Adventure", description: "A shipwrecked family builds a life on a tropical island.", cover_url: cover(583) },
  { id: "236", title: "The Jungle Book", author: "Rudyard Kipling", gutenberg_id: 236, category: "Adventure", description: "Mowgli's life among the wolves of the Indian jungle.", cover_url: cover(236) },
  { id: "103", title: "Around the World in 80 Days", author: "Jules Verne", gutenberg_id: 103, category: "Adventure", description: "Phileas Fogg races the globe on a wager.", cover_url: cover(103) },
  { id: "1184", title: "The Count of Monte Cristo", author: "Alexandre Dumas", gutenberg_id: 1184, category: "Adventure", description: "Betrayal, escape, and elaborate revenge.", cover_url: cover(1184) },
];

export function getBook(id: string): Book | undefined {
  return books.find((b) => b.id === id);
}