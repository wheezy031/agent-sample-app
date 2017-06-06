MongoDB CLI
===========
- Follow the guide if you do not have MongoDB installed and/or are NOT familiar with MongoD
- See: https://docs.mongodb.com/manual/mongo/

MongoDB DB Import
=================
- mongoimport --jsonArray --db chatbot --collection knowledgebase --file data/knowledgebase-data.json
- mongoimport --jsonArray --db chatbot --collection sentiment --file data/sentiment-data.json

MongoDB DB Export
=================
- mongoexport --db chatbot --collection sentiment --out sentiment-data.json
- mongoexport --db chatbot --collection knowledgebase --out knowledgebase-data.json
