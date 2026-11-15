# IELTS Notebook

Open `index.html` in a browser or serve this folder on a static web host. The site includes its styles, icons and practice bank. The daily refresh runs in the browser and needs no account, server job or API key.

At local midnight, the study desk advances its independent reading, vocabulary, conversation and quiz activities. Seven original readings rotate weekly. Each reading answer cites a sentence in the passage. Quiz attempts resume on the same day, and an open exercise can be finished across midnight.

The site checks BBC Learning English’s **6 Minute English** and **The English We Speak** feeds daily. It links to the publisher’s lessons and transcripts, features new episodes on their release dates, and rotates archive lessons between releases. If a feed is unavailable, the site uses its cached catalogue or a built-in selection. External lessons and dictionary recordings need internet access.

UK and US playback uses the device’s English voices. Vocabulary cards include transcriptions and links to Cambridge Dictionary recordings. Review history and custom words use the existing browser storage.

Run the curriculum and progression checks with `node --test tests/practice.test.cjs`.
