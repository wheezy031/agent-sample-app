var mongoose = require('mongoose');

var KnowledgeBaseSchema = new mongoose.Schema({
    keyword: {
        type: String,
        unique: true,
        required: true
    },
    response: {
        type: String,
        required: true
    }
});

mongoose.model('KnowledgeBase', KnowledgeBaseSchema);