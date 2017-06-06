var mongoose = require('mongoose');

var SentimentSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true
  },
  name: {
    type: String,
      unique: true,
      required: true
  }
});

mongoose.model('Sentiment', SentimentSchema);