const natural = require('natural');

class NLPService {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.sentiment = new natural.SentimentAnalyzer('English', this.stemmer, 'afinn');
    this.spamClassifier = new natural.BayesClassifier();
    
    // Train spam classifier with basic examples
    this.initializeSpamClassifier();
  }
  
  initializeSpamClassifier() {
    // Spam examples
    const spamExamples = [
      'buy now limited offer',
      'click here for free money',
      'congratulations you won',
      'increase your followers',
      'check out my profile',
      'visit my website for deals',
      'earn money from home',
      'hot singles in your area',
      'discount pills online',
      'free gift card giveaway',
    ];
    
    // Ham (non-spam) examples
    const hamExamples = [
      'great article thanks for sharing',
      'i disagree with this point',
      'can you explain more about this',
      'this is really helpful',
      'i had a similar experience',
      'thanks for the information',
      'interesting perspective',
      'well written post',
      'i learned something new',
      'good point about that issue',
    ];
    
    spamExamples.forEach(text => this.spamClassifier.addDocument(text, 'spam'));
    hamExamples.forEach(text => this.spamClassifier.addDocument(text, 'ham'));
    
    this.spamClassifier.train();
  }
  
  analyzeText(text) {
    const tokens = this.tokenizer.tokenize(text.toLowerCase());
    const stems = tokens.map(token => this.stemmer.stem(token));
    
    return {
      tokens,
      stems,
      wordCount: tokens.length,
      uniqueWords: new Set(tokens).size,
    };
  }
  
  calculateSentiment(text) {
    const tokens = this.tokenizer.tokenize(text.toLowerCase());
    const score = this.sentiment.getSentiment(tokens);
    
    return {
      score,
      label: score >= 1 ? 'positive' : score <= -1 ? 'negative' : 'neutral',
    };
  }
  
  calculateSpamProbability(text) {
    const classification = this.spamClassifier.getClassifications(text.toLowerCase());
    const spamClass = classification.find(c => c.label === 'spam');
    
    return spamClass ? spamClass.value : 0;
  }
  
  detectCapsRatio(text) {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length === 0) return 0;
    
    const capsCount = (text.match(/[A-Z]/g) || []).length;
    return capsCount / letters.length;
  }
  
  countLinks(text) {
    const urlPattern = /https?:\/\/[^\s]+/gi;
    const matches = text.match(urlPattern) || [];
    return matches.length;
  }
  
  findRepeatedPatterns(text) {
    // Detect repeated characters (e.g., "hiiiii")
    const repeatedChars = /(.)\1{4,}/gi;
    const repeatedWords = /\b(\w+)(\s+\1){2,}\b/gi;
    
    return {
      hasRepeatedChars: repeatedChars.test(text),
      hasRepeatedWords: repeatedWords.test(text),
    };
  }
  
  extractKeywords(text, limit = 5) {
    const tokens = this.tokenizer.tokenize(text.toLowerCase());
    const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but']);
    
    const filtered = tokens.filter(token => 
      token.length > 2 && !stopWords.has(token)
    );
    
    const frequency = {};
    filtered.forEach(token => {
      frequency[token] = (frequency[token] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));
  }
}

module.exports = new NLPService();