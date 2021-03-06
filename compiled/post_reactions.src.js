/**
* @license
* The MIT License (MIT)
*
* Copyright (c) 2018 pixeldepth.net - http://support.proboards.com/user/2671
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*/

class Post_Reactions {

	static init(){
		if(typeof yootil == "undefined"){
			return;
		}

		if(typeof profile_notifications != "undefined" && yootil.location.profile_notifications()){
			profile_notifications.api.register_parser(this.notification_parser);
		}

		let location_check = (
			yootil.location.recent_posts() ||
			yootil.location.search_results() ||
			yootil.location.thread()
		);

		if(!location_check){
			return;
		}

		this.setup();

		$(this.ready.bind(this));
	}

	static ready(){
		if(yootil.user.logged_in()){
			this.create_reaction_button();
		}

		yootil.event.after_search(() => {
			this.create_post_reactions.bind(this)();
			this.create_reaction_button();
		});

		this.create_post_reactions();
	}

	static notification_parser(notification){
		let content = notification.textContent;

		if(content.match(/\{i:(\d+):p(\d+)d:(.+?)\}/g)){
			let id = parseInt(RegExp.$1, 10);
			let post_id = parseInt(RegExp.$2, 10);
			let name = yootil.html_encode(RegExp.$3, true);

			content = $("<span><a href='/user/" + id + "'>" + name + "</a> reacted to your <a href='/post/" + post_id + "/thread'>post.</a>");
		}

		return content;
	}

	static setup(){
		this.KEY = "pixeldepth_post_reactions";
		this.plugin = proboards.plugin.get(this.KEY);

		if(this.plugin && this.plugin.settings){
			this.settings = this.plugin.settings || {};
			this.settings.images = this.plugin.images;
		}

		// Create post lookup table for data

		this.lookup = new Map();
		let post_data = proboards.plugin.keys.data[this.KEY];

		for(let key in post_data){
			this.lookup.set(key, new Post_Reaction_Data(key, post_data[key]));
		}
	}

	static get_data(post_id){
		if(!this.lookup.has(post_id.toString())){
			this.lookup.set(post_id.toString(), new Post_Reaction_Data(post_id));
		}

		return this.lookup.get(post_id.toString());
	}

	static create_reaction_button(){
		let $controls = $("tr.item[id^=post-] .controls");

		$controls.each(function(){
			let post_id = Post_Reactions.fetch_post_id(this);
			let btn_txt = Post_Reactions.settings.add_reaction;

			if(post_id){
				let user_id = yootil.user.id();
				let reaction_data = Post_Reactions.get_data(post_id);
				let has_reacted = (reaction_data && reaction_data.contains(user_id))? true : false;

				if(has_reacted){
					btn_txt = Post_Reactions.settings.remove_reaction;;
				}

				let $button = $("<a href='#' data-reaction='" + post_id + "' role='button' class='button'>" + btn_txt + "</a>");

				$button.on("click", Post_Reactions.button_handler.bind($button, post_id, user_id));

				$(this).prepend($button);
			}
		});
	}

	static button_handler(post_id, user_id){
		if(!yootil.key.write(Post_Reactions.KEY, post_id)){
			pb.window.alert("Permission Denied", "You do not have the permission to write to the key for the Post Reactions plugin.");
			return false;
		} else if(yootil.key.space_left(Post_Reactions.KEY) <= 30){
			pb.window.alert("Post Key Full", "Unfortunately your reaction cannot be saved for this post, as it is out of space.");
			return false;
		}

		let reaction_data = Post_Reactions.get_data(post_id);
		let has_reacted = (reaction_data && reaction_data.contains(user_id))? true : false;

		if(!has_reacted){
			Post_Reactions.add(reaction_data, post_id, user_id);
		} else {
			Post_Reactions.remove(reaction_data, post_id, user_id);
		}

		return false;
	}

	static add(reaction_data, post_id, user_id){
		pb.window.dialog("pd-post-reactions-dialog", {
			modal: true,
			height: Post_Reactions.settings.dialog_height,
			width: Post_Reactions.settings.dialog_width,
			title: Post_Reactions.settings.dialog_title,
			html: Post_Reactions.possible_reactions(),
			resizable: false,
			draggable: false,
			dialogClass: "pd-post-reactions-dialog",

			open: function(){
				let $reaction_dialog = $(this);
				let $btn = $("div.pd-post-reactions-dialog").find("button#btn-add-reaction");
				let $items = $reaction_dialog.find("span.pd-post-reactions-dialog-item");

				$btn.css("opacity", 0.6);

				$items.click(function(){
					$items.css("opacity", 0.5).removeAttr("data-selected");
					$(this).css("opacity", 1).attr("data-selected", "selected");

					$btn.css("opacity", 1);
				});
			},

			buttons: [

				{

					text: "Close",
					click: function(){
						$(this).dialog("close");
					}

				},

				{

					id: "btn-add-reaction",
					text: Post_Reactions.settings.add_reaction,
					click: function(){
						let $reaction_dialog = $(this);
						let $selected_item = $reaction_dialog.find("span.pd-post-reactions-dialog-item[data-selected]");

						if($selected_item.length == 1){
							let id = parseInt($selected_item.attr("data-reaction"), 10);

							reaction_data.add(user_id, id);
							$("a.button[data-reaction='" + post_id + "']").text("Remove Reaction");

							Post_Reactions.update_post(reaction_data);

							$reaction_dialog.dialog("close");

							Post_Reactions.notify(post_id);
						}
					}

				}

			]

		});

		return false;
	}

	static notify(post_id){
		if(typeof profile_notifications != "undefined"){
			let $user_link = $("#post-" + post_id).find(".o-user-link.user-link[data-id]:first");

			if($user_link.length){
				let user_id = parseInt($user_link.attr("data-id"), 10) || 0;

				if(user_id && user_id != yootil.user.id()){
					profile_notifications.api.create(user_id).notification("{i:" + yootil.user.id() + ":p" + post_id + "d:" + yootil.user.name() + "}");
				}
			}
		}
	}

	static remove(reaction_data, post_id, user_id){
		reaction_data.remove(user_id);
		this.update_post(reaction_data);
		$("a.button[data-reaction='" + post_id + "']").text(this.settings.add_reaction);
	}

	static possible_reactions(){
		let html = "";

		html += "<div class='pd-post-reactions-table'>";
			html += "<div class='pd-post-reactions-row'>";

			let counter = 0;

			//for(let item of this.settings.possible_reactions){
			for(let i = 0, l = this.settings.possible_reactions.length; i < l; i ++){
				let item = this.settings.possible_reactions[i];

				if(item.staff_only == 1 && !yootil.user.is_staff()){
					continue;
				}

				html += "<div class='pd-post-reactions-cell'>";
					html += "<span class='pd-post-reactions-dialog-item' data-reaction='" + item.unique_id + "'>";
						html += "<img src='" + item.image_url + "' title='" + item.title + "' />";
					html += "</span>";
				html += "</div>";

				counter ++;

				if(counter == this.settings.reactions_per_row){
					html += "</div><div class='pd-post-reactions-row'>";
					counter = 0;
				}
			}

			html += "</div>";
		html += "</div>";

		return html;
	}

	static fetch_post_id(control){
		let $post_row = $(control).closest("tr.item.post");
		let post_id_parts = ($post_row.attr("id") || "").split("-");

		if(post_id_parts && post_id_parts.length == 2){
			return ~~ post_id_parts[1];
		}

		return 0;
	}

	static update_post(reaction_data){
		if(reaction_data && reaction_data.post_id){
			let data = reaction_data.data;
			let post_id = reaction_data.post_id;
			let $post_row = $("tr.item.post#post-" + post_id);
			let $foot = $post_row.find("td.foot");
			let $reactions_div = $foot.find("div.pd-post-reactions-container");

			if(data.constructor == Array && data.length > 0){
				if(!$reactions_div.length){
					$reactions_div = $("<div class='pd-post-reactions-container'></div>");

					if($foot.has("div.signature").length){
						$foot.find("div.signature").before($reactions_div);
					} else {
						$foot.append($reactions_div);
					}
				}

				$reactions_div.html(Post_Reactions.fetch_post_reactions(reaction_data.data));
			} else if($reactions_div.length == 1){
				$reactions_div.remove();
			}
		}
	}

	static create_post_reactions(){
		this.lookup.forEach(function(val, key, m){
			this.update_post(val);
		}.bind(this));
	}

	static fetch_post_reactions(reaction_data){
		let counts = new Map();

		for(let data in reaction_data){
			if(!counts.has(reaction_data[data].r)){
				counts.set(reaction_data[data].r, 0);
			}

			counts.set(reaction_data[data].r, (counts.get(reaction_data[data].r) + 1));
		}

		let html = "";

		counts.forEach(function(val, key, map){
			let reaction = this.find_reaction(key);

			if(reaction){
				let total = "";

				if(this.settings.show_counts == 1){
					total = " x " + val;
				}

				let title = "";

				if(this.settings.show_titles == 1){
					title = "<span class='pd-post-reactions-item-title'>" + reaction.title;

					if(total.length){
						title += "<br />" + total;
					}

					title += "</span>";
				}

				html += "<span class='pd-post-reactions-item' data-reaction='" + reaction.unique_id + "'>";
					html += "<img src='" + reaction.image_url + "' title='" + reaction.title + total + "' />";
					html += title;
				html += "</span>";
			}
		}.bind(this));

		return html;
	}

	static find_reaction(id = 0){
		for(let i = 0, l = this.settings.possible_reactions.length; i < l; i ++){
			if(parseInt(this.settings.possible_reactions[i].unique_id, 10) == id){
				return this.settings.possible_reactions[i];
			}
		}

		return false;
	}

}



class Post_Reaction_Data {

	constructor(post_id = 0, data = []){
		this._post_id = post_id;
		this._data = this.parse_data(data);
	}

	get post_id(){
		return this._post_id;
	}

	get data(){
		return this._data;
	}

	parse_data(data = []){
		let parsed = [];

		if(data.constructor == Array && data.length){
			for(let i = 0, l = data.length; i < l; i ++){
//			for(let value of data){
				if(yootil.is_json(data[i])){
					parsed.push(JSON.parse(data[i]));
				}
			}
		}

		return parsed;
	}

	contains(user_id){
		for(let reactor in this._data){
		//for(let reactors of this._data){
			if(this._data[reactor].u == yootil.user.id()){
				return true;
			}
		}

		return false;
	}

	add(user_id, reaction_id){
		let current_data = yootil.key.value(Post_Reactions.KEY, this._post_id);
		let entry = {

			u: user_id,
			r: reaction_id

		};

		let d = JSON.stringify(entry);

		if(!current_data || !current_data.constructor == Array){
			yootil.key.set(Post_Reactions.KEY, [d], this._post_id);
		} else {
			yootil.key.push(Post_Reactions.KEY, d, this._post_id);
		}

		this._data.push(entry);
	}

	remove(user_id){
		let new_data = [];
		let stringed_data = [];

		for(let reactor in this._data){
		//for(let value of this._data){
			if(this._data[reactor].u != yootil.user.id()){
				new_data.push(this._data[reactor]);
				stringed_data.push(JSON.stringify(this._data[reactor]));
			}
		}

		this._data = new_data;
		yootil.key.set(Post_Reactions.KEY, stringed_data, this._post_id);
	}

}

Post_Reactions.init();